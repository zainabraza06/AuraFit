/**
 * When rule-based normalization validates but misses fields, or validation fails
 * on recoverable gaps, try LLM patch + re-normalize once.
 */
import { completeJsonWithProviderFallback } from '../../../services/llmClient.js';
import logger from './logger.js';

function extractJson(text) {
  try {
    const clean = String(text).replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

function rawFromMapped(mapped) {
  if (!mapped) return null;
  return {
    title: mapped.title,
    name: mapped.title,
    price: mapped.price,
    images: mapped.images,
    imageUrl: mapped.images?.[0],
    productUrl: mapped.productUrl,
    description: mapped.description || '',
    tags: mapped.tags || [],
    handle: mapped.handle,
    compareAtPrice: mapped.compareAtPrice,
    sizes: mapped.sizes,
    vendor: mapped.vendor,
    productType: mapped.productType
  };
}

/**
 * @param {string} vertical 'clothing' | 'shoes' | 'watches' | 'jewelry'
 */
export async function tryRepairWithLLM(mapped, brandConfig, reason, vertical, normalizeFn) {
  if (!mapped || !normalizeFn) return null;

  const raw = rawFromMapped(mapped);
  if (!raw?.productUrl) return null;

  const schemaHint =
    vertical === 'shoes'
      ? `shoeType enum, subCategory, closure, heelHeight, gender, occasion array, season array, upperMaterial string`
      : vertical === 'watches'
        ? `watchType, dialShape, strapType, movement, waterResistance, gender, occasion, dialColor`
        : vertical === 'jewelry'
          ? `jewelryType, jewelryCategory, metalFinish, stoneWork, gender, occasion`
          : `dressStyle, pieceType, stitchedType, pattern, subCategory, gender, fabric`;

  const user = `Shopify listing failed rules: ${reason}

Vertical: ${vertical}
Brand config JSON: ${JSON.stringify({ brand: brandConfig.brand, subCategory: brandConfig.subCategory, occasion: brandConfig.occasion, style: brandConfig.style, gender: brandConfig.gender })}

Raw listing:
title: ${raw.title}
price: ${raw.price}
tags: ${(raw.tags || []).join(', ')}
description (truncated): ${(raw.description || '').slice(0, 1800)}
product_type: ${raw.productType || ''}
vendor: ${raw.vendor || ''}

Return ONLY JSON with fields that help classification (use null for unknown). No markdown.`;

  try {
    const { text, provider } = await completeJsonWithProviderFallback({
      system: `You are a Pakistani retail catalog assistant. Output a single flat JSON object with optional keys: ${schemaHint}. Values must match the vertical's typical enums where applicable.`,
      user,
      temperature: 0.1
    });
    logger.info(`[productRepair] ${vertical} repair via ${provider}`);
    const patch = extractJson(text);
    if (!patch || typeof patch !== 'object') return null;

    const merged = {
      ...raw,
      title: patch.name || patch.title || raw.title,
      description: [raw.description, patch.descriptionNote].filter(Boolean).join(' ').slice(0, 4000),
      tags: [...new Set([...(raw.tags || []), ...(patch.tags || [])])].slice(0, 50),
      ...patch
    };
    return normalizeFn(merged, brandConfig);
  } catch (e) {
    logger.warn(`[productRepair] LLM repair failed: ${e.message}`);
    return null;
  }
}
