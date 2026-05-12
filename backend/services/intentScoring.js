/**
 * Intent-vs-product scoring (unit-tested). Independent of Mongo queries.
 */
import { normalizeColor } from './colorNormalize.js';

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const d = Math.sqrt(normA) * Math.sqrt(normB);
  return d ? dot / d : 0;
}

export function textualMatchScore(product, query) {
  if (query == null || !String(query).trim()) return 0.3;
  const q = String(query).toLowerCase().trim();
  const text = [
    product.name || '',
    product.description || '',
    ...(product.tags || []),
    ...(product.style || []),
    ...(product.occasion || [])
  ]
    .join(' ')
    .toLowerCase();
  const qWords = q.split(/[\s,.-]+/).filter((w) => w.length > 2);
  if (!qWords.length) return 0.3;
  let hit = 0;
  for (const w of qWords) {
    if (text.includes(w)) hit++;
  }
  const score = 0.3 + 0.6 * (hit / qWords.length);
  return Math.min(1, parseFloat(score.toFixed(4)));
}

function scoreColor(product, intent) {
  if (!intent || intent.color === 'Any' || intent.color == null) return 0.4;

  const wantFamily = intent.color;
  const wantShadeRaw = intent.shade;
  const primary = (product.primaryColor || '').trim();
  const colors = (product.colors || []).map((c) => String(c).trim());

  const primaryL = primary.toLowerCase();
  const shadeL = wantShadeRaw ? String(wantShadeRaw).toLowerCase() : '';

  if (shadeL && primaryL === shadeL) return 1.0;
  if (wantShadeRaw && colors.some((c) => c.toLowerCase() === shadeL)) return 0.93;

  const canonPrimary = normalizeColor(primary) || primary;
  const canonShade = wantShadeRaw ? normalizeColor(wantShadeRaw) : null;
  const canonFamily = normalizeColor(String(wantFamily)) || wantFamily;

  if (canonShade && canonPrimary && canonShade === canonPrimary && primaryL !== shadeL) return 0.85;

  if (wantFamily && primaryL === String(wantFamily).toLowerCase()) return 1.0;

  if (canonShade) {
    for (const c of colors) {
      const cn = normalizeColor(c) || c;
      if (cn === canonShade || (canonFamily && cn === canonFamily)) return 0.78;
    }
  }

  if (canonFamily && canonPrimary && canonFamily !== canonPrimary) return 0.08;
  return 0.08;
}

function scorePrice(product, intent) {
  const max = intent?.maxBudget ?? 0;
  if (!max || max <= 0) return null;
  const price = product.price ?? 0;
  if (price <= max) return 1.0;
  const overRatio = (price - max) / max;
  return Math.max(0, parseFloat((1 - overRatio * 2).toFixed(4)));
}

function scorePiece(product, intent) {
  const piece = intent?.piece;
  if (piece == null || piece === '') return null;
  const sub = (product.subCategory || '').toLowerCase();
  const want = String(piece).toLowerCase();

  if (want.includes('unstitched')) {
    return sub.startsWith('unstitched') ? 1.0 : 0.25;
  }
  if (want.replace(/\s/g, '').includes('3-piece')) {
    return sub.includes('3-piece') ? 1.0 : 0.3;
  }
  return 0.5;
}

function scoreOccasionStyle(product, intent) {
  let s = 0;
  const po = product.occasion || [];
  const io = intent?.occasion || [];
  if (io.length && po.length) {
    const hit = io.filter((o) => po.map((x) => String(x).toLowerCase()).includes(String(o).toLowerCase()))
      .length;
    if (hit > 0) s += 0.4 + 0.05 * hit;
  }
  const ps = product.style || [];
  const is = intent?.style || [];
  if (is.length && ps.length) {
    const hit = is.filter((x) => ps.map((y) => String(y).toLowerCase()).includes(String(x).toLowerCase()))
      .length;
    if (hit > 0) s += 0.35 + 0.05 * hit;
  }
  if (intent?.dressType === 'bridal' && (product.subCategory === 'bridal' || po.includes('wedding'))) s += 0.45;
  return s;
}

function scoreSemantic(product, intent, queryEmbedding) {
  const pEmb = product.embedding;
  const qEmb = queryEmbedding;
  if (Array.isArray(pEmb) && pEmb.length && Array.isArray(qEmb) && qEmb.length === pEmb.length) {
    return parseFloat(cosineSimilarity(pEmb, qEmb).toFixed(4));
  }
  const summary = intent?.intentSummary || '';
  return textualMatchScore(product, summary);
}

export function scoreProductAgainstIntent(product, intent, queryEmbedding) {
  const colorMatch = scoreColor(product, intent);
  const priceMatch = scorePrice(product, intent);
  const pieceMatch = scorePiece(product, intent);
  const semanticMatch = scoreSemantic(product, intent, queryEmbedding);
  const os = scoreOccasionStyle(product, intent);

  let total =
    colorMatch * 0.28 +
    semanticMatch * 0.22 +
    os +
    (priceMatch != null ? priceMatch * 0.12 : 0) +
    (pieceMatch != null ? pieceMatch * 0.1 : 0.05);

  return {
    colorMatch,
    priceMatch,
    pieceMatch,
    semanticMatch,
    total: parseFloat(Math.min(3, total).toFixed(4))
  };
}
