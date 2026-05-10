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

// ─── Color alias map ──────────────────────────────────────────────────────────
// Covers English variants + Pakistani Urdu transliterations used by local brands.
// Keep in sync with colorTheory.js normalize() — both must resolve to the same
// canonical names so cross-function scoring stays consistent.
// Canonical colors our system supports (must match CANONICAL_COLORS in recommendations.js)
export const CANONICAL_COLORS = [
  'Black', 'White', 'Grey', 'Red', 'Pink', 'Purple',
  'Blue', 'Green', 'Teal', 'Yellow', 'Orange',
  'Gold', 'Beige', 'Brown', 'Multicolor'
];

// Every shade/variant → canonical color.
// Gemini now returns canonical colors directly; this map handles the DB side
// (how brands store colors in scraped product records).
const COLOR_ALIASES = {
  // ── Blue ──────────────────────────────────────────────────────────────────
  'navy': 'Blue', 'navy blue': 'Blue', 'sky blue': 'Blue', 'cobalt': 'Blue',
  'royal blue': 'Blue', 'light blue': 'Blue', 'powder blue': 'Blue',
  'steel blue': 'Blue', 'pastel blue': 'Blue', 'dark blue': 'Blue',
  'deep blue': 'Blue', 'midnight blue': 'Blue', 'electric blue': 'Blue',
  'baby blue': 'Blue', 'prussian blue': 'Blue', 'cerulean': 'Blue',
  'azure': 'Blue', 'denim': 'Blue', 'indigo': 'Blue',
  'nila': 'Blue',                       // Urdu: dark blue/indigo

  // ── Green ─────────────────────────────────────────────────────────────────
  'emerald': 'Green', 'olive': 'Green', 'mint': 'Green', 'sage': 'Green',
  'forest green': 'Green', 'bottle green': 'Green', 'sea green': 'Green',
  'dark green': 'Green', 'deep green': 'Green', 'mehendi green': 'Green',
  'mint green': 'Green', 'lime green': 'Green', 'lime': 'Green',
  'pista': 'Green', 'pistachio': 'Green', 'apple green': 'Green',
  'jungle green': 'Green', 'hunter green': 'Green', 'kelly green': 'Green',
  'army green': 'Green', 'military green': 'Green', 'forest': 'Green',
  'neon green': 'Green', 'grass green': 'Green', 'parrot green': 'Green',
  'dhani': 'Green',                     // Urdu: light grassy green
  'mehendi': 'Green',                   // henna green
  'sabz': 'Green',                      // Urdu: green

  // ── Red / Maroon ──────────────────────────────────────────────────────────
  'maroon': 'Red', 'crimson': 'Red', 'burgundy': 'Red', 'wine': 'Red',
  'rust': 'Red', 'dark red': 'Red', 'deep red': 'Red', 'brick red': 'Red',
  'dark maroon': 'Red', 'deep maroon': 'Red', 'dark burgundy': 'Red',
  'cherry': 'Red', 'cardinal': 'Red', 'scarlet': 'Red', 'ruby': 'Red',
  'raspberry': 'Red', 'strawberry': 'Red', 'blood red': 'Red',
  'mehroon': 'Red', 'mehrun': 'Red', 'merun': 'Red', // Urdu: maroon
  'surkh': 'Red',                       // Urdu: bright red
  'laal': 'Red',                        // Urdu: red

  // ── Beige / Nude ──────────────────────────────────────────────────────────
  'beige': 'Beige', 'nude': 'Beige', 'camel': 'Beige', 'fawn': 'Beige',
  'khaki': 'Beige', 'khaaki': 'Beige', 'sand': 'Beige', 'oat': 'Beige',
  'linen': 'Beige', 'biscuit': 'Beige', 'wheat': 'Beige', 'taupe': 'Beige',
  'nude beige': 'Beige', 'warm beige': 'Beige', 'natural': 'Beige',

  // ── White / Off-white ─────────────────────────────────────────────────────
  'ivory': 'White', 'cream': 'White', 'off white': 'White', 'off-white': 'White',
  'snow': 'White', 'pearl': 'White', 'chalk': 'White', 'milk white': 'White',
  'pure white': 'White', 'bright white': 'White', 'warm white': 'White',
  'eggshell': 'White', 'antique white': 'White',
  'safed': 'White',                     // Urdu: white

  // ── Grey ──────────────────────────────────────────────────────────────────
  'silver': 'Grey', 'ash': 'Grey', 'steel grey': 'Grey', 'slate': 'Grey',
  'stone': 'Grey', 'smoke': 'Grey', 'gray': 'Grey', 'grey': 'Grey',
  'light grey': 'Grey', 'dark grey': 'Grey', 'steel gray': 'Grey',
  'platinum': 'Grey', 'gunmetal': 'Grey', 'charcoal grey': 'Grey',
  'warm grey': 'Grey', 'cool grey': 'Grey', 'dove grey': 'Grey',
  'charcoal': 'Black', 'graphite': 'Black', 'onyx': 'Black',
  'ebony': 'Black', 'jet black': 'Black', 'pitch black': 'Black',
  'off black': 'Black',

  // ── Pink ──────────────────────────────────────────────────────────────────
  'blush': 'Pink', 'peach': 'Pink', 'rose': 'Pink', 'fuchsia': 'Pink',
  'hot pink': 'Pink', 'dusty pink': 'Pink', 'baby pink': 'Pink',
  'nude pink': 'Pink', 'pastel pink': 'Pink', 'dusty rose': 'Pink',
  'old rose': 'Pink', 'candy pink': 'Pink', 'shocking pink': 'Pink',
  'light pink': 'Pink', 'deep pink': 'Pink', 'salmon': 'Pink',
  'magenta': 'Pink', 'cerise': 'Pink', 'flamingo': 'Pink',
  'carnation': 'Pink', 'blush pink': 'Pink', 'rose pink': 'Pink',
  'bubblegum': 'Pink', 'millennial pink': 'Pink', 'macaroon pink': 'Pink',
  'gulabi': 'Pink',                     // Urdu: pink

  // ── Purple / Violet ───────────────────────────────────────────────────────
  'lavender': 'Purple', 'lilac': 'Purple', 'mauve': 'Purple', 'plum': 'Purple',
  'violet': 'Purple', 'grape': 'Purple', 'wisteria': 'Purple',
  'pastel purple': 'Purple', 'light purple': 'Purple', 'deep purple': 'Purple',
  'dark purple': 'Purple', 'royal purple': 'Purple', 'dusty purple': 'Purple',
  'pastel lavender': 'Purple', 'pastel lilac': 'Purple', 'amethyst': 'Purple',
  'orchid': 'Purple', 'heather': 'Purple', 'periwinkle': 'Purple',
  'jamuni': 'Purple',                   // Urdu: purple/violet
  'baingan': 'Purple',                  // Urdu: eggplant purple

  // ── Orange ────────────────────────────────────────────────────────────────
  'coral': 'Orange', 'terracotta': 'Orange', 'amber': 'Orange',
  'burnt orange': 'Orange', 'peach orange': 'Orange', 'apricot': 'Orange',
  'pumpkin': 'Orange', 'tangerine': 'Orange', 'mango': 'Orange',
  'deep orange': 'Orange', 'burnt sienna': 'Orange', 'copper': 'Orange',
  'narangi': 'Orange',                  // Urdu: orange

  // ── Yellow ────────────────────────────────────────────────────────────────
  'mustard': 'Yellow', 'lemon': 'Yellow', 'saffron': 'Yellow',
  'lemon yellow': 'Yellow', 'pastel yellow': 'Yellow', 'butter': 'Yellow',
  'canary': 'Yellow', 'sunflower': 'Yellow', 'golden yellow': 'Yellow',
  'bright yellow': 'Yellow', 'neon yellow': 'Yellow', 'chartreuse': 'Yellow',
  'ochre': 'Yellow', 'corn': 'Yellow', 'honey': 'Yellow',
  'zard': 'Yellow', 'peela': 'Yellow', // Urdu: yellow

  // ── Gold ──────────────────────────────────────────────────────────────────
  'golden': 'Gold', 'gold': 'Gold', 'antique gold': 'Gold', 'dull gold': 'Gold',
  'champagne': 'Gold', 'bronze': 'Gold', 'brass': 'Gold', 'metallic gold': 'Gold',
  'light gold': 'Gold', 'rose gold': 'Gold',

  // ── Teal / Turquoise ──────────────────────────────────────────────────────
  'turquoise': 'Teal', 'aqua': 'Teal', 'cyan': 'Teal', 'seafoam': 'Teal',
  'teal green': 'Teal', 'dark teal': 'Teal', 'deep teal': 'Teal',
  'teal blue': 'Teal', 'peacock': 'Teal', 'peacock blue': 'Teal',
  'ferozi': 'Teal',                     // Urdu: turquoise/teal (very common in Pakistan)
  'firozi': 'Teal',                     // alternate spelling

  // ── Brown ─────────────────────────────────────────────────────────────────
  'chocolate': 'Brown', 'mocha': 'Brown', 'coffee': 'Brown', 'caramel': 'Brown',
  'tan': 'Brown', 'walnut': 'Brown', 'toffee': 'Brown', 'chestnut': 'Brown',
  'dark brown': 'Brown', 'light brown': 'Brown', 'mahogany': 'Brown',
  'sienna': 'Brown', 'sepia': 'Brown', 'hazel': 'Brown', 'cocoa': 'Brown',
  'saddle brown': 'Brown', 'raw umber': 'Brown',

  // ── Multicolor / Printed ──────────────────────────────────────────────────
  'multi': 'Multicolor', 'multicolor': 'Multicolor', 'multi-color': 'Multicolor',
  'multi colour': 'Multicolor', 'multicolour': 'Multicolor',
  'printed': 'Multicolor', 'colourful': 'Multicolor', 'colorful': 'Multicolor',
  'floral': 'Multicolor', 'patterned': 'Multicolor', 'geometric': 'Multicolor',
  'abstract': 'Multicolor', 'tie dye': 'Multicolor', 'ombre': 'Multicolor'
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
