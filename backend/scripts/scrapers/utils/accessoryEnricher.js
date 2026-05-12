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

async function llmPatch(system, user) {
  const { text, provider } = await completeJsonWithProviderFallback({ system, user, temperature: 0.12 });
  logger.info(`[accessoryEnricher] enriched via ${provider}`);
  return extractJson(text);
}

export async function enrichShoeProduct(product) {
  const user = `Product:
Name: ${product.name}
Brand: ${product.brand}
Description: ${(product.description || '').slice(0, 2000)}
Tags: ${(product.tags || []).join(', ')}
Price: ${product.price}

Return ONLY JSON with optional keys: shoeType, closure, heelHeight, upperMaterial, soleType, gender, occasion (array), season (array), sportUse (boolean). Use enums compatible with footwear catalog.`;
  const patch = await llmPatch(
    'You output a single JSON object only. Pakistani fashion footwear.',
    user
  );
  if (!patch) return product;
  const out = { ...product, aiEnriched: true };
  for (const k of ['shoeType', 'closure', 'heelHeight', 'upperMaterial', 'soleType', 'gender', 'sportUse']) {
    if (patch[k] !== undefined && patch[k] !== null && patch[k] !== '') out[k] = patch[k];
  }
  if (Array.isArray(patch.occasion) && patch.occasion.length) out.occasion = patch.occasion;
  if (Array.isArray(patch.season) && patch.season.length) out.season = patch.season;
  return out;
}

export async function enrichWatchProduct(product) {
  const user = `Product:
Name: ${product.name}
Description: ${(product.description || '').slice(0, 2000)}
Tags: ${(product.tags || []).join(', ')}

Return ONLY JSON: watchType, dialShape, caseMaterial, strapType, movement, waterResistance, crystal, features (array), dialColor, caseDiameterMm (number), gender, occasion (array).`;
  const patch = await llmPatch('Watch catalog JSON only.', user);
  if (!patch) return product;
  const out = { ...product, aiEnriched: true };
  for (const k of ['watchType', 'dialShape', 'caseMaterial', 'strapType', 'movement', 'waterResistance', 'crystal', 'dialColor', 'gender']) {
    if (patch[k] != null && patch[k] !== '') out[k] = patch[k];
  }
  if (typeof patch.caseDiameterMm === 'number') out.caseDiameterMm = patch.caseDiameterMm;
  if (Array.isArray(patch.features)) out.features = patch.features;
  if (Array.isArray(patch.occasion)) out.occasion = patch.occasion;
  return out;
}

export async function enrichJewelryProduct(product) {
  const user = `Product:
Name: ${product.name}
Description: ${(product.description || '').slice(0, 2000)}
Tags: ${(product.tags || []).join(', ')}

Return ONLY JSON: jewelryType, jewelryCategory, metalFinish, stoneWork, setPieceCount (number), gender, occasion (array), style (array).`;
  const patch = await llmPatch('Pakistani fashion jewelry. JSON only.', user);
  if (!patch) return product;
  const out = { ...product, aiEnriched: true };
  for (const k of ['jewelryType', 'jewelryCategory', 'metalFinish', 'stoneWork', 'gender']) {
    if (patch[k] != null && patch[k] !== '') out[k] = patch[k];
  }
  if (typeof patch.setPieceCount === 'number') out.setPieceCount = patch.setPieceCount;
  if (Array.isArray(patch.occasion)) out.occasion = patch.occasion;
  if (Array.isArray(patch.style)) out.style = patch.style;
  return out;
}
