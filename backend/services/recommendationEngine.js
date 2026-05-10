/**
 * recommendationEngine.js
 * Dynamic AI outfit recommendation scoring system.
 *
 * Score formulas:
 *   Product-vs-Product: embeddingSimilarity×0.5 + color×0.2 + occasion×0.2 + style×0.1
 *   Intent-vs-Product:  colorMatch×0.45 + occasion×0.25 + style×0.15 + keywords×0.15
 *
 * The intent-based scorer does NOT rely on MongoDB-level color filtering, so it
 * works even when colors are stored as aliases (Lavender→Purple, Cream→White, etc.).
 */

import Product from '../models/Product.js';
import { getColorArrayCompatibility } from './colorTheory.js';

// ─── Scoring weights (product-to-product) ────────────────────────────────────
const WEIGHTS = { embedding: 0.5, color: 0.2, occasion: 0.2, style: 0.1 };

// ─── Color alias map (mirrors colorTheory.js normalize) ──────────────────────
const COLOR_ALIASES = {
  'navy': 'Blue', 'navy blue': 'Blue', 'sky blue': 'Blue', 'cobalt': 'Blue', 'royal blue': 'Blue',
  'emerald': 'Green', 'olive': 'Green', 'mint': 'Green', 'sage': 'Green', 'forest green': 'Green',
  'maroon': 'Red', 'crimson': 'Red', 'burgundy': 'Red', 'wine': 'Red', 'rust': 'Red',
  'beige': 'Beige', 'nude': 'Beige', 'camel': 'Beige', 'fawn': 'Beige', 'khaki': 'Beige', 'sand': 'Beige',
  'silver': 'Grey', 'ash': 'Grey', 'charcoal': 'Black', 'graphite': 'Black',
  'ivory': 'White', 'cream': 'White', 'off white': 'White', 'off-white': 'White', 'snow': 'White',
  'blush': 'Pink', 'peach': 'Pink', 'rose': 'Pink', 'fuchsia': 'Pink', 'hot pink': 'Pink', 'dusty pink': 'Pink',
  'lavender': 'Purple', 'lilac': 'Purple', 'mauve': 'Purple', 'plum': 'Purple', 'violet': 'Purple', 'grape': 'Purple',
  'coral': 'Orange', 'terracotta': 'Orange', 'amber': 'Orange',
  'mustard': 'Yellow', 'lemon': 'Yellow', 'saffron': 'Yellow', 'golden': 'Gold', 'gold': 'Gold',
  'turquoise': 'Teal', 'aqua': 'Teal', 'cyan': 'Teal', 'seafoam': 'Teal',
  'chocolate': 'Brown', 'mocha': 'Brown', 'coffee': 'Brown', 'caramel': 'Brown', 'tan': 'Brown'
};

function normalizeColor(color) {
  if (!color) return null;
  const lower = color.toLowerCase().trim();
  if (COLOR_ALIASES[lower]) return COLOR_ALIASES[lower];
  return color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
}

// ─── Cosine similarity ────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Set overlap score ────────────────────────────────────────────────────────
function setOverlapScore(arr1 = [], arr2 = []) {
  if (!arr1.length || !arr2.length) return 0.4;
  const set1 = new Set(arr1.map((s) => s.toLowerCase()));
  const matches = arr2.filter((s) => set1.has(s.toLowerCase())).length;
  return Math.min(1, matches / Math.max(arr1.length, arr2.length) + 0.2);
}

// ─── Score a product vs. another product ─────────────────────────────────────
export function scoreProduct(source, candidate) {
  let embeddingScore = 0;
  if (source.embedding?.length && candidate.embedding?.length) {
    embeddingScore = cosineSimilarity(source.embedding, candidate.embedding);
  } else {
    embeddingScore = keywordSimilarity(source, candidate);
  }

  const colorScore = getColorArrayCompatibility(
    source.colors || [source.primaryColor],
    candidate.colors || [candidate.primaryColor]
  );
  const occasionScore = setOverlapScore(source.occasion, candidate.occasion);
  const styleScore = setOverlapScore(source.style, candidate.style);

  const finalScore =
    embeddingScore * WEIGHTS.embedding +
    colorScore * WEIGHTS.color +
    occasionScore * WEIGHTS.occasion +
    styleScore * WEIGHTS.style;

  return {
    total: parseFloat(finalScore.toFixed(3)),
    embeddingSimilarity: parseFloat(embeddingScore.toFixed(3)),
    colorCompatibility: parseFloat(colorScore.toFixed(3)),
    occasionCompatibility: parseFloat(occasionScore.toFixed(3)),
    styleCompatibility: parseFloat(styleScore.toFixed(3))
  };
}

// ─── Score a product against a user intent ────────────────────────────────────
// Fixes the "purple shows white" bug: no DB-level color filtering here.
// Every product in the pool is scored; correct color ranks at the top.
function scoreProductAgainstIntent(product, intent) {
  const { color, occasion = [], style = [] } = intent;

  // ── Color match ────────────────────────────────────────────────────────────
  let colorScore = 0.4; // baseline when no color requested

  if (color && color.toLowerCase() !== 'any') {
    const targetNorm = normalizeColor(color);

    const productColors = [product.primaryColor, ...(product.colors || [])].filter(Boolean);
    const productNorms = productColors.map(normalizeColor).filter(Boolean);

    if (productNorms.includes(targetNorm)) {
      colorScore = 1.0; // canonical match (e.g. Lavender → Purple ✓)
    } else {
      const targetLower = (targetNorm || color).toLowerCase();
      const rawLower = productColors.map((c) => (c || '').toLowerCase());
      const substringMatch = rawLower.some(
        (c) => c.includes(targetLower) || targetLower.includes(c)
      );
      colorScore = substringMatch ? 0.82 : 0.08; // hard penalty for wrong color
    }
  }

  // ── Occasion & style ──────────────────────────────────────────────────────
  const occasionScore = setOverlapScore(occasion, product.occasion || []);
  const styleScore = setOverlapScore(style, product.style || []);

  // ── Keyword / text match ──────────────────────────────────────────────────
  const queryTerms = [
    ...occasion, ...style,
    color && color !== 'Any' ? color.toLowerCase() : ''
  ].filter(Boolean);

  const productText = [
    product.name || '', product.description || '',
    ...(product.tags || []), ...(product.occasion || []), ...(product.style || [])
  ].join(' ').toLowerCase();

  const keywordScore =
    queryTerms.length > 0
      ? queryTerms.filter((t) => productText.includes(t)).length / queryTerms.length
      : 0.5;

  const finalScore =
    colorScore * 0.45 + occasionScore * 0.25 + styleScore * 0.15 + keywordScore * 0.15;

  return {
    total: parseFloat(finalScore.toFixed(3)),
    colorMatch: parseFloat(colorScore.toFixed(3)),
    occasionMatch: parseFloat(occasionScore.toFixed(3)),
    styleMatch: parseFloat(styleScore.toFixed(3)),
    keywordMatch: parseFloat(keywordScore.toFixed(3))
  };
}

// ─── Fallback keyword similarity (no embeddings) ─────────────────────────────
function keywordSimilarity(p1, p2) {
  const words1 = extractKeywords(p1);
  const words2 = extractKeywords(p2);
  if (!words1.size || !words2.size) return 0.3;
  let overlap = 0;
  for (const w of words1) { if (words2.has(w)) overlap++; }
  return Math.min(0.9, overlap / Math.sqrt(words1.size * words2.size) + 0.2);
}

function extractKeywords(product) {
  const text = [
    product.name || '', product.description || '',
    ...(product.tags || []), ...(product.style || []),
    ...(product.occasion || []), product.brand || '', product.subCategory || ''
  ].join(' ').toLowerCase();

  return new Set(
    text.split(/[\s,.-]+/).filter((w) => w.length > 3).filter((w) => !STOP_WORDS.has(w))
  );
}

const STOP_WORDS = new Set([
  'with', 'that', 'this', 'from', 'your', 'have', 'will', 'been',
  'more', 'than', 'they', 'their', 'what', 'when', 'where', 'which'
]);

// ─── Product-to-product recommendations (product detail page) ─────────────────
export async function getRecommendations(productId, options = {}) {
  const { maxShoes = 6, maxClothing = 6 } = options;

  const source = await Product.findById(productId).lean();
  if (!source) throw new Error('Product not found');

  const isClothing = source.category === 'clothing';
  const isShoe = source.category === 'shoes';
  const baseQuery = { _id: { $ne: source._id } };

  const [shoePool, clothingPool] = await Promise.all([
    isClothing ? Product.find({ ...baseQuery, category: 'shoes' }).limit(100).lean() : [],
    isShoe
      ? Product.find({ ...baseQuery, category: 'clothing' }).limit(100).lean()
      : Product.find({ ...baseQuery, category: 'clothing' }).limit(50).lean()
  ]);

  const scoredShoes = shoePool
    .map((c) => ({ product: c, scores: scoreProduct(source, c) }))
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, maxShoes);

  const scoredClothing = clothingPool
    .map((c) => ({ product: c, scores: scoreProduct(source, c) }))
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, maxClothing);

  return { source, shoes: scoredShoes, complementaryClothing: scoredClothing, generatedAt: new Date() };
}

// ─── Intent-based outfit builder (chat / "Style Me") ──────────────────────────
// Fetches a large pool WITHOUT DB-level color filtering, then scores every
// product so correct colors rank highest regardless of storage format.
export async function getOutfitForQuery(intent) {
  const { maxBudget = 0 } = intent;

  // Only apply budget at DB level (exact number, no fuzzy)
  const clothingQuery = { category: 'clothing' };
  if (maxBudget > 0) clothingQuery.price = { $lte: maxBudget };

  const clothingPool = await Product.find(clothingQuery)
    .select('name brand category subCategory price primaryColor colors occasion style tags imageUrl images productUrl description')
    .limit(300)
    .lean();

  if (clothingPool.length === 0) {
    return { heroDress: null, otherDresses: [], shoes: [], scores: [] };
  }

  // Score every clothing product against the parsed intent
  const scored = clothingPool
    .map((product) => ({ product, scores: scoreProductAgainstIntent(product, intent) }))
    .sort((a, b) => b.scores.total - a.scores.total);

  const top10 = scored.slice(0, 10);
  const heroDress = top10[0]?.product || null;

  // Best-matching shoes for the hero dress
  let shoes = [];
  if (heroDress) {
    const shoePool = await Product.find({ category: 'shoes' })
      .select('name brand category subCategory price primaryColor colors occasion style tags imageUrl images productUrl')
      .limit(150)
      .lean();

    shoes = shoePool
      .map((s) => ({ ...s, _score: scoreProduct(heroDress, s).total }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
  }

  return {
    heroDress,
    otherDresses: top10.slice(1).map((d) => d.product),
    shoes,
    scores: top10.map((d) => ({ productId: d.product._id, ...d.scores }))
  };
}
