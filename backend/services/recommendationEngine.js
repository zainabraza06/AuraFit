/**
 * recommendationEngine.js
 *
 * Two public exports:
 *   getRecommendations(productId)   — product-detail-page outfit suggestions
 *   getOutfitForQuery(intent)       — "Style Me" chat-based outfit builder
 *
 * "Style Me" flow:
 *   1. Build DB query from ONLY the fields the user specified.
 *   2. Progressive constraint relaxation (one-by-one) until ≥50 candidates found.
 *      Relaxation order: occasion → print → dressStyle → stitching → pieces → fabric → exact color → color family
 *   3. Top 50 candidates sent to Gemini for AI ranking with per-product reasons.
 *   4. Top 10 ranked results returned; one best-matching shoe found per product.
 */

import Product from '../models/Product.js';
import { getColorArrayCompatibility } from './colorTheory.js';
import { rankProductsWithAI } from './aiService.js';

// ─── Canonical color list & alias map ────────────────────────────────────────
export const CANONICAL_COLORS = [
  'Black', 'White', 'Grey', 'Red', 'Pink', 'Purple',
  'Blue', 'Green', 'Teal', 'Yellow', 'Orange',
  'Gold', 'Beige', 'Brown', 'Multicolor'
];

const COLOR_ALIASES = {
  'navy': 'Blue', 'navy blue': 'Blue', 'sky blue': 'Blue', 'cobalt': 'Blue',
  'royal blue': 'Blue', 'light blue': 'Blue', 'powder blue': 'Blue',
  'steel blue': 'Blue', 'pastel blue': 'Blue', 'dark blue': 'Blue',
  'deep blue': 'Blue', 'midnight blue': 'Blue', 'electric blue': 'Blue',
  'baby blue': 'Blue', 'prussian blue': 'Blue', 'cerulean': 'Blue',
  'azure': 'Blue', 'denim': 'Blue', 'indigo': 'Blue', 'nila': 'Blue',
  'emerald': 'Green', 'olive': 'Green', 'mint': 'Green', 'sage': 'Green',
  'forest green': 'Green', 'bottle green': 'Green', 'sea green': 'Green',
  'dark green': 'Green', 'deep green': 'Green', 'mehendi green': 'Green',
  'mint green': 'Green', 'lime green': 'Green', 'lime': 'Green',
  'pista': 'Green', 'pistachio': 'Green', 'apple green': 'Green',
  'jungle green': 'Green', 'hunter green': 'Green', 'kelly green': 'Green',
  'army green': 'Green', 'military green': 'Green', 'forest': 'Green',
  'neon green': 'Green', 'grass green': 'Green', 'parrot green': 'Green',
  'dhani': 'Green', 'mehendi': 'Green', 'sabz': 'Green',
  'maroon': 'Red', 'crimson': 'Red', 'burgundy': 'Red', 'wine': 'Red',
  'rust': 'Red', 'dark red': 'Red', 'deep red': 'Red', 'brick red': 'Red',
  'dark maroon': 'Red', 'deep maroon': 'Red', 'dark burgundy': 'Red',
  'cherry': 'Red', 'cardinal': 'Red', 'scarlet': 'Red', 'ruby': 'Red',
  'raspberry': 'Red', 'strawberry': 'Red', 'blood red': 'Red',
  'mehroon': 'Red', 'mehrun': 'Red', 'merun': 'Red', 'surkh': 'Red', 'laal': 'Red',
  'beige': 'Beige', 'nude': 'Beige', 'camel': 'Beige', 'fawn': 'Beige',
  'khaki': 'Beige', 'khaaki': 'Beige', 'sand': 'Beige', 'oat': 'Beige',
  'linen': 'Beige', 'biscuit': 'Beige', 'wheat': 'Beige', 'taupe': 'Beige',
  'nude beige': 'Beige', 'warm beige': 'Beige', 'natural': 'Beige',
  'ivory': 'White', 'cream': 'White', 'off white': 'White', 'off-white': 'White',
  'snow': 'White', 'pearl': 'White', 'chalk': 'White', 'milk white': 'White',
  'pure white': 'White', 'bright white': 'White', 'warm white': 'White',
  'eggshell': 'White', 'antique white': 'White', 'safed': 'White',
  'silver': 'Grey', 'ash': 'Grey', 'steel grey': 'Grey', 'slate': 'Grey',
  'stone': 'Grey', 'smoke': 'Grey', 'gray': 'Grey', 'grey': 'Grey',
  'light grey': 'Grey', 'dark grey': 'Grey', 'steel gray': 'Grey',
  'platinum': 'Grey', 'gunmetal': 'Grey', 'charcoal grey': 'Grey',
  'warm grey': 'Grey', 'cool grey': 'Grey', 'dove grey': 'Grey',
  'charcoal': 'Black', 'graphite': 'Black', 'onyx': 'Black',
  'ebony': 'Black', 'jet black': 'Black', 'pitch black': 'Black', 'off black': 'Black',
  'blush': 'Pink', 'peach': 'Pink', 'rose': 'Pink', 'fuchsia': 'Pink',
  'hot pink': 'Pink', 'dusty pink': 'Pink', 'baby pink': 'Pink',
  'nude pink': 'Pink', 'pastel pink': 'Pink', 'dusty rose': 'Pink',
  'old rose': 'Pink', 'candy pink': 'Pink', 'shocking pink': 'Pink',
  'light pink': 'Pink', 'deep pink': 'Pink', 'salmon': 'Pink',
  'magenta': 'Pink', 'cerise': 'Pink', 'flamingo': 'Pink',
  'carnation': 'Pink', 'blush pink': 'Pink', 'rose pink': 'Pink',
  'bubblegum': 'Pink', 'millennial pink': 'Pink', 'macaroon pink': 'Pink', 'gulabi': 'Pink',
  'lavender': 'Purple', 'lilac': 'Purple', 'mauve': 'Purple', 'plum': 'Purple',
  'violet': 'Purple', 'grape': 'Purple', 'wisteria': 'Purple',
  'pastel purple': 'Purple', 'light purple': 'Purple', 'deep purple': 'Purple',
  'dark purple': 'Purple', 'royal purple': 'Purple', 'dusty purple': 'Purple',
  'amethyst': 'Purple', 'orchid': 'Purple', 'heather': 'Purple', 'periwinkle': 'Purple',
  'jamuni': 'Purple', 'baingan': 'Purple',
  'coral': 'Orange', 'terracotta': 'Orange', 'amber': 'Orange',
  'burnt orange': 'Orange', 'peach orange': 'Orange', 'apricot': 'Orange',
  'pumpkin': 'Orange', 'tangerine': 'Orange', 'mango': 'Orange',
  'deep orange': 'Orange', 'burnt sienna': 'Orange', 'copper': 'Orange', 'narangi': 'Orange',
  'mustard': 'Yellow', 'lemon': 'Yellow', 'saffron': 'Yellow',
  'lemon yellow': 'Yellow', 'pastel yellow': 'Yellow', 'butter': 'Yellow',
  'canary': 'Yellow', 'sunflower': 'Yellow', 'golden yellow': 'Yellow',
  'bright yellow': 'Yellow', 'neon yellow': 'Yellow', 'chartreuse': 'Yellow',
  'ochre': 'Yellow', 'corn': 'Yellow', 'honey': 'Yellow', 'zard': 'Yellow', 'peela': 'Yellow',
  'golden': 'Gold', 'gold': 'Gold', 'antique gold': 'Gold', 'dull gold': 'Gold',
  'champagne': 'Gold', 'bronze': 'Gold', 'brass': 'Gold', 'metallic gold': 'Gold',
  'light gold': 'Gold', 'rose gold': 'Gold',
  'turquoise': 'Teal', 'aqua': 'Teal', 'cyan': 'Teal', 'seafoam': 'Teal',
  'teal green': 'Teal', 'dark teal': 'Teal', 'deep teal': 'Teal',
  'teal blue': 'Teal', 'peacock': 'Teal', 'peacock blue': 'Teal',
  'ferozi': 'Teal', 'firozi': 'Teal',
  'chocolate': 'Brown', 'mocha': 'Brown', 'coffee': 'Brown', 'caramel': 'Brown',
  'tan': 'Brown', 'walnut': 'Brown', 'toffee': 'Brown', 'chestnut': 'Brown',
  'dark brown': 'Brown', 'light brown': 'Brown', 'mahogany': 'Brown',
  'sienna': 'Brown', 'sepia': 'Brown', 'hazel': 'Brown', 'cocoa': 'Brown',
  'saddle brown': 'Brown', 'raw umber': 'Brown',
  'multi': 'Multicolor', 'multicolor': 'Multicolor', 'multi-color': 'Multicolor',
  'multi colour': 'Multicolor', 'multicolour': 'Multicolor',
  'printed': 'Multicolor', 'colourful': 'Multicolor', 'colorful': 'Multicolor',
  'floral': 'Multicolor', 'patterned': 'Multicolor', 'geometric': 'Multicolor',
  'abstract': 'Multicolor', 'tie dye': 'Multicolor', 'ombre': 'Multicolor'
};

export function normalizeColor(color) {
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
    dot  += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Set overlap ──────────────────────────────────────────────────────────────
function setOverlapScore(arr1 = [], arr2 = []) {
  if (!arr1.length || !arr2.length) return 0.4;
  const set1 = new Set(arr1.map((s) => s.toLowerCase()));
  const matches = arr2.filter((s) => set1.has(s.toLowerCase())).length;
  return Math.min(1, matches / Math.max(arr1.length, arr2.length) + 0.2);
}

// ─── Keyword similarity (fallback when no embeddings) ────────────────────────
const STOP_WORDS = new Set(['with', 'that', 'this', 'from', 'your', 'have', 'will', 'been', 'more', 'than', 'they', 'their', 'what', 'when', 'where', 'which']);

function extractKeywords(product) {
  const text = [
    product.name || '', product.description || '',
    ...(product.tags || []), ...(product.style || []),
    ...(product.occasion || []), product.brand || '', product.subCategory || ''
  ].join(' ').toLowerCase();
  return new Set(text.split(/[\s,.-]+/).filter((w) => w.length > 3).filter((w) => !STOP_WORDS.has(w)));
}

function keywordSimilarity(p1, p2) {
  const w1 = extractKeywords(p1);
  const w2 = extractKeywords(p2);
  if (!w1.size || !w2.size) return 0.3;
  let overlap = 0;
  for (const w of w1) { if (w2.has(w)) overlap++; }
  return Math.min(0.9, overlap / Math.sqrt(w1.size * w2.size) + 0.2);
}

// ─── Product-to-product scoring (used for shoes + product-page recs) ──────────
export function scoreProduct(source, candidate) {
  let embeddingScore = 0;
  if (source.embedding?.length && candidate.embedding?.length) {
    embeddingScore = cosineSimilarity(source.embedding, candidate.embedding);
  } else {
    embeddingScore = keywordSimilarity(source, candidate);
  }
  const colorScore   = getColorArrayCompatibility(source.colors || [source.primaryColor], candidate.colors || [candidate.primaryColor]);
  const occasionScore = setOverlapScore(source.occasion, candidate.occasion);
  const styleScore   = setOverlapScore(source.style, candidate.style);

  const total = embeddingScore * 0.5 + colorScore * 0.2 + occasionScore * 0.2 + styleScore * 0.1;
  return {
    total: parseFloat(total.toFixed(3)),
    embeddingSimilarity: parseFloat(embeddingScore.toFixed(3)),
    colorCompatibility:  parseFloat(colorScore.toFixed(3)),
    occasionCompatibility: parseFloat(occasionScore.toFixed(3)),
    styleCompatibility:  parseFloat(styleScore.toFixed(3))
  };
}

// ─── Shoe match reason ────────────────────────────────────────────────────────
export function generateShoeMatchReason(shoe, dress) {
  const parts = [];
  const shoeColor  = normalizeColor(shoe.primaryColor  || '') || shoe.primaryColor  || 'neutral';
  const dressColor = normalizeColor(dress.primaryColor || '') || dress.primaryColor || 'this outfit';

  const neutralDesc = {
    Black: 'versatile black goes with everything',
    White: 'crisp white creates a fresh contrast',
    Brown: 'warm brown earthly complement',
    Beige: 'neutral beige ties the look together',
    Grey:  'cool grey adds sophisticated balance',
    Gold:  'metallic gold elevates the ensemble'
  };

  if (shoeColor === dressColor) parts.push(`tonal ${shoeColor} match for a cohesive look`);
  else if (neutralDesc[shoeColor]) parts.push(neutralDesc[shoeColor]);
  else parts.push(`${shoeColor} pairs with ${dressColor}`);

  const sharedOccasions = (shoe.occasion || []).filter((o) =>
    (dress.occasion || []).map((x) => x.toLowerCase()).includes(o.toLowerCase())
  );
  if (sharedOccasions.length) parts.push(`both ${sharedOccasions.slice(0, 2).join(' & ')} appropriate`);

  const sharedStyles = (shoe.style || []).filter((s) =>
    (dress.style || []).map((x) => x.toLowerCase()).includes(s.toLowerCase())
  );
  if (sharedStyles.length) parts.push(`${sharedStyles[0]} style alignment`);

  return parts.join(' · ') || `complements the ${dressColor} outfit`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESSIVE RELAXATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// Which constraints the user actually specified (only filter on these)
function getSpecifiedConstraints(intent) {
  const specified = new Set();
  if (intent.occasion?.length)                              specified.add('occasion');
  if (intent.print)                                         specified.add('print');
  if (intent.dressStyle)                                    specified.add('dressStyle');
  if (intent.stitching)                                     specified.add('stitching');
  if (intent.pieces)                                        specified.add('pieces');
  if (intent.fabric)                                        specified.add('fabric');
  if (intent.colorExact)                                    specified.add('colorExact');
  if (intent.colorFamily && intent.colorFamily !== 'Any')   specified.add('colorFamily');
  return specified;
}

// Build DB query for a given relaxation state
function buildDBQuery(intent, dropped, colorMode) {
  const query = { category: 'clothing' };

  // Hard constraints — always applied (gender, budget)
  if (intent.gender && intent.gender !== 'women' && intent.gender !== 'unisex') {
    query.gender = intent.gender;
  }
  if (intent.maxBudget > 0) {
    query.price = { $lte: intent.maxBudget * 1.2 };
  }

  // Soft constraints — removed one by one during relaxation
  if (!dropped.has('occasion') && intent.occasion?.length) {
    query.occasion = { $in: intent.occasion };
  }
  if (!dropped.has('print') && intent.print) {
    query.print = intent.print;
  }
  if (!dropped.has('dressStyle') && intent.dressStyle) {
    query.dressStyle = intent.dressStyle;
  }
  if (!dropped.has('stitching') && intent.stitching) {
    query.stitching = intent.stitching;
  }
  if (!dropped.has('pieces') && intent.pieces) {
    query.pieces = intent.pieces;
  }
  if (!dropped.has('fabric') && intent.fabric) {
    query.fabric = { $regex: new RegExp(intent.fabric, 'i') };
  }

  // Color — exact shade → canonical family → none
  if (colorMode === 'exact' && intent.colorExact) {
    query.exactColors = { $elemMatch: { $regex: new RegExp(`^${intent.colorExact}$`, 'i') } };
  } else if (colorMode === 'family' && intent.colorFamily && intent.colorFamily !== 'Any') {
    query.primaryColor = intent.colorFamily;
  }
  // colorMode === 'none': no color filter

  return query;
}

const SELECT_FIELDS = 'name brand category subCategory dressStyle stitching print pieces fabric type price primaryColor colors primaryExactColor exactColors occasion style tags imageUrl images productUrl description gender';

async function fetchCandidates(intent) {
  const specified = getSpecifiedConstraints(intent);

  // Build the ordered relaxation sequence based on what the user actually specified
  // Each step drops one more constraint from the DB query
  const relaxOrder = ['occasion', 'print', 'dressStyle', 'stitching', 'pieces', 'fabric'];

  const levels = [];
  const dropped = new Set();

  // Level 0: all specified constraints, exact color
  const initialColorMode = specified.has('colorExact') ? 'exact' : (specified.has('colorFamily') ? 'family' : 'none');
  levels.push({ dropped: new Set(), colorMode: initialColorMode, label: null });

  // Drop soft constraints one by one (only if they were specified)
  for (const constraint of relaxOrder) {
    if (specified.has(constraint)) {
      dropped.add(constraint);
      levels.push({ dropped: new Set(dropped), colorMode: initialColorMode, label: constraint });
    }
  }

  // If exact color was specified, add a family-fallback level
  if (specified.has('colorExact') && specified.has('colorFamily')) {
    levels.push({ dropped: new Set(dropped), colorMode: 'family', label: 'colorExact' });
  }
  // Finally, drop color entirely
  if (specified.has('colorExact') || specified.has('colorFamily')) {
    levels.push({ dropped: new Set(dropped), colorMode: 'none', label: 'color' });
  }

  let bestProducts = [];
  let relaxationMessage = null;
  let relaxedFields = [];

  for (const level of levels) {
    const query = buildDBQuery(intent, level.dropped, level.colorMode);
    const pool = await Product.find(query).select(SELECT_FIELDS).limit(100).lean();

    if (pool.length > bestProducts.length) {
      bestProducts = pool;
      relaxedFields = [...level.dropped];
      if (level.label === 'colorExact') {
        relaxedFields.push('exact color → showing color family');
      } else if (level.label === 'color') {
        relaxedFields.push('color');
      }
    }

    if (pool.length >= 50) break; // enough to send to AI
  }

  // Build relaxation message for the frontend
  if (relaxedFields.length > 0) {
    const dropped = relaxedFields.filter((f) => !f.includes('→'));
    const colorNote = relaxedFields.find((f) => f.includes('→'));
    const parts = [];
    if (dropped.length) parts.push(`relaxed ${dropped.join(', ')}`);
    if (colorNote)      parts.push(colorNote);
    relaxationMessage = `No exact match found — ${parts.join('; ')}.`;
  }

  return { products: bestProducts, relaxationMessage, specified };
}

// ─── Find one best shoe per dress ────────────────────────────────────────────
async function matchShoesForProducts(dresses) {
  if (!dresses.length) return [];

  const shoePool = await Product.find({ category: 'shoes' })
    .select('name brand category subCategory price primaryColor colors occasion style tags imageUrl images productUrl')
    .limit(150)
    .lean();

  if (!shoePool.length) return dresses.map(() => null);

  return dresses.map((dress) => {
    const best = shoePool
      .map((shoe) => ({ shoe, score: scoreProduct(dress, shoe) }))
      .sort((a, b) => b.score.total - a.score.total)[0];

    return best
      ? { product: best.shoe, score: best.score.total, reason: generateShoeMatchReason(best.shoe, dress) }
      : null;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Chat-based "Style Me" outfit builder
// ═══════════════════════════════════════════════════════════════════════════════
export async function getOutfitForQuery(intent) {
  // 1. Fetch candidates via progressive relaxation
  const { products, relaxationMessage, specified } = await fetchCandidates(intent);

  if (!products.length) {
    return {
      results: [],
      matchQuality: { tier: 'none', message: "We couldn't find any products matching your request in our catalog." },
      relaxationMessage: null
    };
  }

  // 2. AI ranking — send up to 50 candidates, get back ranked list with reasons
  const ranked = await rankProductsWithAI(products.slice(0, 50), intent);
  const top10  = ranked.slice(0, 10);

  // 3. One shoe per dress (parallel)
  const shoes = await matchShoesForProducts(top10.map((r) => r.product));

  // 4. Match quality tier
  const tier = !relaxationMessage ? 'exact'
    : top10.length >= 8 ? 'close'
    : top10.length >= 4 ? 'similar'
    : 'loose';

  return {
    results: top10.map((r, i) => ({
      product:     r.product,
      rank:        r.rank,
      matchReason: r.reason,
      shoe:        shoes[i] || null
    })),
    matchQuality: {
      tier,
      totalFound: products.length,
      message: relaxationMessage
    },
    relaxationMessage
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Product-detail-page recommendations
// ═══════════════════════════════════════════════════════════════════════════════
export async function getRecommendations(productId, options = {}) {
  const { maxShoes = 6, maxClothing = 6 } = options;
  const source = await Product.findById(productId).lean();
  if (!source) throw new Error('Product not found');

  const baseQuery = { _id: { $ne: source._id } };
  const isClothing = source.category === 'clothing';

  const [shoePool, clothingPool] = await Promise.all([
    isClothing ? Product.find({ ...baseQuery, category: 'shoes' }).limit(100).lean() : [],
    Product.find({ ...baseQuery, category: 'clothing' }).limit(isClothing ? 50 : 100).lean()
  ]);

  const scoredShoes    = shoePool.map((c) => ({ product: c, scores: scoreProduct(source, c) })).sort((a, b) => b.scores.total - a.scores.total).slice(0, maxShoes);
  const scoredClothing = clothingPool.map((c) => ({ product: c, scores: scoreProduct(source, c) })).sort((a, b) => b.scores.total - a.scores.total).slice(0, maxClothing);

  return { source, shoes: scoredShoes, complementaryClothing: scoredClothing, generatedAt: new Date() };
}

// Exported for vectorSearch.js compatibility
export { scoreProductAgainstIntent };
function scoreProductAgainstIntent() { return { total: 0 }; } // stub — no longer used internally
