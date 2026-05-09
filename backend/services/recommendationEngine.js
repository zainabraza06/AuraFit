/**
 * recommendationEngine.js
 * AI outfit recommendation scoring system.
 *
 * Final Score Formula:
 *   finalScore = embeddingSimilarity * 0.5
 *              + colorCompatibility  * 0.2
 *              + occasionMatch       * 0.2
 *              + styleMatch          * 0.1
 *
 * For products without embeddings, falls back to metadata-only scoring.
 */

import Product from '../models/Product.js';
import { getColorArrayCompatibility } from './colorTheory.js';

// ─── Scoring weights ──────────────────────────────────────────────────────────
const WEIGHTS = {
  embedding: 0.5,
  color: 0.2,
  occasion: 0.2,
  style: 0.1
};

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
  if (!arr1.length || !arr2.length) return 0.4; // Partial credit when unknown
  const set1 = new Set(arr1.map((s) => s.toLowerCase()));
  const matches = arr2.filter((s) => set1.has(s.toLowerCase())).length;
  return Math.min(1, matches / Math.max(arr1.length, arr2.length) + 0.2);
}

// ─── Score a single candidate against a source product ───────────────────────

/**
 * scoreProduct(source, candidate)
 * Returns 0-1 composite compatibility score.
 */
export function scoreProduct(source, candidate) {
  // Embedding similarity
  let embeddingScore = 0;
  if (source.embedding?.length && candidate.embedding?.length) {
    embeddingScore = cosineSimilarity(source.embedding, candidate.embedding);
  } else {
    // Fallback: keyword-based text similarity
    embeddingScore = keywordSimilarity(source, candidate);
  }

  // Color compatibility
  const colorScore = getColorArrayCompatibility(
    source.colors || [source.primaryColor],
    candidate.colors || [candidate.primaryColor]
  );

  // Occasion match
  const occasionScore = setOverlapScore(source.occasion, candidate.occasion);

  // Style match
  const styleScore = setOverlapScore(source.style, candidate.style);

  // Weighted composite
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
    product.name || '',
    product.description || '',
    ...(product.tags || []),
    ...(product.style || []),
    ...(product.occasion || []),
    product.brand || '',
    product.subCategory || ''
  ].join(' ').toLowerCase();

  return new Set(
    text
      .split(/[\s,.-]+/)
      .filter((w) => w.length > 3)
      .filter((w) => !STOP_WORDS.has(w))
  );
}

const STOP_WORDS = new Set([
  'with', 'that', 'this', 'from', 'your', 'have', 'will', 'been',
  'more', 'than', 'they', 'their', 'what', 'when', 'where', 'which'
]);

// ─── Main recommendation function ────────────────────────────────────────────

/**
 * getRecommendations(productId, options)
 * Finds best-matching shoes and complementary clothing for a given product.
 *
 * @param {string} productId - MongoDB product _id
 * @param {object} options   - { maxShoes, maxClothing, maxAccessories }
 * @returns {object} { shoes[], complementaryClothing[], scores }
 */
export async function getRecommendations(productId, options = {}) {
  const { maxShoes = 6, maxClothing = 6, maxAccessories = 4 } = options;

  const source = await Product.findById(productId).lean();
  if (!source) throw new Error('Product not found');

  const isClothing = source.category === 'clothing';
  const isShoe = source.category === 'shoes';

  // ── Find candidates ──
  // Exclude same product and same brand to broaden discovery
  const baseQuery = {
    _id: { $ne: source._id }
  };

  const [shoePool, clothingPool] = await Promise.all([
    isClothing
      ? Product.find({ ...baseQuery, category: 'shoes' }).limit(100).lean()
      : [],
    isShoe
      ? Product.find({ ...baseQuery, category: 'clothing' }).limit(100).lean()
      : Product.find({ ...baseQuery, category: 'clothing', _id: { $ne: source._id } }).limit(50).lean()
  ]);

  // ── Score and rank ──
  const scoredShoes = shoePool
    .map((candidate) => ({ product: candidate, scores: scoreProduct(source, candidate) }))
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, maxShoes);

  const scoredClothing = clothingPool
    .map((candidate) => ({ product: candidate, scores: scoreProduct(source, candidate) }))
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, maxClothing);

  return {
    source,
    shoes: scoredShoes,
    complementaryClothing: scoredClothing,
    generatedAt: new Date()
  };
}

/**
 * getOutfitForQuery(intent)
 * AI-powered outfit builder from a parsed user intent.
 * Used by the chat API.
 *
 * @param {object} intent - { color, occasion, style, maxBudget }
 * @returns {object} { heroDress, otherDresses, shoes, scores }
 */
export async function getOutfitForQuery(intent) {
  const { color, occasion = [], style = [], maxBudget = 0 } = intent;

  // ── Clothing query ──
  const clothingQuery = { category: 'clothing' };
  if (color && color.toLowerCase() !== 'any') {
    clothingQuery.$or = [
      { primaryColor: { $regex: color, $options: 'i' } },
      { colors: { $regex: color, $options: 'i' } }
    ];
  }
  if (occasion.length > 0) clothingQuery.occasion = { $in: occasion };
  if (maxBudget > 0) clothingQuery.price = { $lte: maxBudget };

  let dresses = await Product.aggregate([{ $match: clothingQuery }, { $sample: { size: 12 } }]);
  if (dresses.length === 0) {
    dresses = await Product.aggregate([{ $match: { category: 'clothing' } }, { $sample: { size: 8 } }]);
  }

  const heroDress = dresses[0] || null;

  // ── Shoe recommendations for the hero dress ──
  let shoes = [];
  if (heroDress) {
    const shoePool = await Product.find({ category: 'shoes' }).limit(80).lean();
    shoes = shoePool
      .map((s) => ({ ...s, _score: scoreProduct(heroDress, s).total }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
  }

  return {
    heroDress,
    otherDresses: dresses.slice(1, 7),
    shoes
  };
}
