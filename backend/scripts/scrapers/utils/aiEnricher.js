/**
 * aiEnricher.js
 * Fills missing ClothingProduct fields via LLM when rules are insufficient.
 * Provider order: OpenRouter → Groq → Gemini 1.5 → Gemini 2.5 (see services/llmClient.js)
 */

import { completeJsonWithProviderFallback } from '../../../services/llmClient.js';
import logger from './logger.js';

const FILLABLE_SCALAR = [
  'dressStyle', 'fashionType', 'stitchedType', 'pieceType',
  'pattern', 'sleeveType', 'neckline', 'fitType',
  'colorFamily', 'fabric', 'subCategory', 'gender'
];

const FILLABLE_ARRAY = ['occasion', 'trendTags', 'style'];

export function needsAiRefinement(product) {
  if (!product?.description && !(product?.tags?.length)) return false;
  const textLen = (product.description || '').length + (product.tags || []).join(' ').length;
  if (textLen < 25) return false;

  const weak = (f) => {
    const v = product[f];
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === null || v === '';
  };

  let missingCritical = 0;
  for (const f of ['gender', 'pieceType', 'stitchedType', 'dressStyle', 'pattern']) {
    if (weak(f)) missingCritical++;
  }

  const pd = product.pieceDetails;
  const piecesWeak =
    !pd ||
    !Array.isArray(pd.includes) ||
    pd.includes.length === 0 ||
    (product.pieceType &&
      /piece/.test(product.pieceType) &&
      pd.totalCount &&
      pd.includes.length < Math.min(pd.totalCount, 3));

  return missingCritical >= 2 || piecesWeak || (product.metadataScore ?? 0) < 0.52;
}

function isMissing(product, field) {
  const v = product[field];
  if (FILLABLE_ARRAY.includes(field)) return !Array.isArray(v) || v.length === 0;
  return v === undefined || v === null || v === '';
}

function pieceDetailsMissing(product) {
  const pd = product.pieceDetails;
  if (!pd || !Array.isArray(pd.includes) || pd.includes.length === 0) return true;
  if (product.pieceType && pd.totalCount && pd.includes.length < Math.min(pd.totalCount, 2)) return true;
  return false;
}

export async function enrichProduct(product) {
  const missingScalars = FILLABLE_SCALAR.filter((f) => isMissing(product, f));
  const missingArrays = FILLABLE_ARRAY.filter((f) => isMissing(product, f));
  const needPieceDetails = pieceDetailsMissing(product);

  if (
    missingScalars.length === 0 &&
    missingArrays.length === 0 &&
    !needPieceDetails
  ) {
    return product;
  }

  const userPrompt = buildPrompt(product, {
    missingScalars,
    missingArrays,
    needPieceDetails
  });

  try {
    const { text, provider } = await completeJsonWithProviderFallback({
      system:
        'You are a Pakistani fashion catalog assistant. Output a single JSON object only. No markdown fences.',
      user: userPrompt,
      temperature: 0.15
    });
    logger.info(`[AIEnricher] "${product.name}" via ${provider}`);

    const parsed = extractJson(text);
    if (!parsed) {
      logger.warn(`[AIEnricher] Could not parse JSON for: ${product.name}`);
      return product;
    }

    const enriched = { ...product };
    for (const field of missingScalars) {
      if (parsed[field] !== undefined && parsed[field] !== null && parsed[field] !== '') {
        enriched[field] = parsed[field];
      }
    }
    for (const field of missingArrays) {
      if (Array.isArray(parsed[field]) && parsed[field].length > 0) {
        enriched[field] = parsed[field];
      }
    }
    if (needPieceDetails && parsed.pieceDetails && typeof parsed.pieceDetails === 'object') {
      const inc = Array.isArray(parsed.pieceDetails.includes)
        ? parsed.pieceDetails.includes.map((s) => String(s).toLowerCase().trim()).filter(Boolean)
        : [];
      const tc = Number(parsed.pieceDetails.totalCount);
      if (inc.length > 0) {
        enriched.pieceDetails = {
          includes: inc.slice(0, 8),
          totalCount: Number.isFinite(tc) && tc >= 1 && tc <= 4 ? tc : inc.length
        };
      }
    }

    enriched.aiEnriched = true;
    enriched.metadataScore = recomputeScore(enriched);
    return enriched;
  } catch (err) {
    logger.warn(`[AIEnricher] All providers failed for "${product.name}": ${err.message}`);
    return product;
  }
}

function buildPrompt(product, { missingScalars, missingArrays, needPieceDetails }) {
  const parts = [...missingScalars, ...missingArrays];
  if (needPieceDetails) parts.push('pieceDetails');
  const fullDesc = (product.description || '').slice(0, 2000);

  return `You are a Pakistani fashion product tagger. From the product text, fill ONLY the missing fields listed.

Product:
- Name: ${product.name}
- Brand: ${product.brand}
- Full description:
${fullDesc}
- Tags: ${(product.tags || []).join(', ')}
- Price (PKR): ${product.price}
- SubCategory (if known): ${product.subCategory || 'unknown'}
- PieceType (if known): ${product.pieceType || 'unknown'}
- Existing style tags: ${(product.style || []).join(', ')}
- Existing occasion: ${(product.occasion || []).join(', ')}

Missing: ${[...new Set(parts)].join(', ')}

RULES:
- dressStyle: one of [kurta, shalwar-kameez, frock, maxi, gown, lehenga, saree, abaya, tunic, co-ord, palazzo, western, shirt, trouser, top, jacket, pant-coat, sherwani, other]
- fashionType: one of [eastern, western, fusion]
- stitchedType: one of [stitched, unstitched, semi-stitched]
- pieceType: one of [1-piece, 2-piece, 3-piece, 4-piece]
- subCategory: one of [2-piece, 3-piece, 4-piece, kurta, pants, shalwar, dupatta, unstitched-1-piece, unstitched-2-piece, unstitched-3-piece, festive, bridal, western, co-ord, other]
- pattern: one of [plain, printed, embroidered, digital-print, floral, geometric, textured, embellished, mixed]
- gender: one of [women, men, kids, unisex]
- sleeveType: one of [full-sleeve, half-sleeve, sleeveless, cap-sleeve, three-quarter] or omit
- neckline: one of [round, v-neck, boat-neck, collar, keyhole, halter, square, off-shoulder] or omit
- fitType: one of [loose, regular, slim, flared, straight] or omit
- colorFamily: one of [red, blue, green, yellow, pink, purple, orange, neutral, earth, teal, multicolor]
- fabric: short fabric name or omit
- occasion: array subset of [casual, formal, party, bridal, eid, office, mehndi, wedding]
- trendTags: subset of [minimalist, luxury, festive, traditional, modern]
- style: array of short adjective tags or omit
- pieceDetails: { "includes": string[], "totalCount": number } — tokens like shirt, kurta, trouser, shalwar, dupatta, inner, waistcoat, coat, top, bottom.

Return ONLY valid JSON. No markdown.`;
}

function extractJson(text) {
  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

function recomputeScore(p) {
  let s = 0;
  if (p.name) s += 0.15;
  if (p.price > 0) s += 0.10;
  if (p.images && p.images.length > 0) s += 0.10;
  if (p.colors && p.colors.length > 0 && p.colors[0] !== 'Multicolor') s += 0.10;
  if (p.occasion && p.occasion.length > 0) s += 0.10;
  if (p.style && p.style.length > 0) s += 0.05;
  if (p.description && p.description.length > 20) s += 0.05;
  if (p.fabric) s += 0.08;
  if (p.dressStyle) s += 0.08;
  if (p.pieceType) s += 0.07;
  if (p.pattern) s += 0.05;
  if (p.sleeveType) s += 0.03;
  if (p.neckline) s += 0.02;
  if (p.fitType) s += 0.02;
  if (p.pieceDetails?.includes?.length) s += 0.05;
  return parseFloat(Math.min(1, s).toFixed(2));
}
