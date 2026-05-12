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

import ClothingProduct from '../models/ClothingProduct.js';
import { formatClothingForApi, intentPrintToPatterns } from './productCompat.js';
import { getColorArrayCompatibility } from './colorTheory.js';
import { rankProductsWithAI } from './aiService.js';
import { normalizeColor } from './colorNormalize.js';

// ─── Canonical color list ────────────────────────────────────────────────────
export const CANONICAL_COLORS = [
  'Black', 'White', 'Grey', 'Red', 'Pink', 'Purple',
  'Blue', 'Green', 'Teal', 'Yellow', 'Orange',
  'Gold', 'Beige', 'Brown', 'Multicolor'
];

export { normalizeColor };

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

// Default relaxation order: first entry = dropped first = least important by default.
// "color" is a unified placeholder covering exact shade → family → none.
const DEFAULT_RELAX_ORDER = ['occasion', 'print', 'dressStyle', 'stitching', 'pieces', 'fabric', 'color'];

/**
 * Build the unified relaxation order respecting the user's stated priority.
 * Most important (last in constraintPriority array = drops last) overrides default.
 * Constraints not in constraintPriority keep their default relative order and drop first.
 */
function buildUnifiedRelaxOrder(constraintPriority = []) {
  if (!constraintPriority.length) return DEFAULT_RELAX_ORDER;

  const priority = constraintPriority
    .map((c) => c.toLowerCase().trim())
    .filter((c) => DEFAULT_RELAX_ORDER.includes(c));

  if (!priority.length) return DEFAULT_RELAX_ORDER;

  // Non-prioritized: keep default relative order, placed first (dropped first)
  const notPrioritized = DEFAULT_RELAX_ORDER.filter((c) => !priority.includes(c));
  // Prioritized reversed: least important of the group drops first
  const prioritizedReversed = [...priority].reverse();

  return [...notPrioritized, ...prioritizedReversed];
}

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

// Accessory/non-outfit terms that should never appear as main outfit results
const NON_OUTFIT_PATTERN = /dupatta|stole|scarf|scarves|clutch|bag|jewelry|jewellery/i;

// Build DB query for a given relaxation state
function buildDBQuery(intent, dropped, colorMode) {
  const query = {
    category: 'clothing',
    subCategory: { $nin: ['dupatta', 'scarves', 'jewelry', 'bags'] },
    name: { $not: NON_OUTFIT_PATTERN }
  };

  // Hard constraints — always applied (gender, budget)
  if (intent.gender && intent.gender !== 'women' && intent.gender !== 'unisex') {
    query.gender = intent.gender;
  }
  if (intent.maxBudget > 0) {
    query.price = { $lte: intent.maxBudget * 1.2 };
  }

  // Soft constraints — removed one by one during relaxation
  if (!dropped.has('occasion') && intent.occasion?.length) {
    // "bridal" and "wedding" are used interchangeably across brands — expand both
    const expanded = new Set(intent.occasion);
    if (expanded.has('bridal'))  expanded.add('wedding');
    if (expanded.has('wedding')) expanded.add('bridal');
    query.occasion = { $in: [...expanded] };
  }
  if (!dropped.has('print') && intent.print) {
    const patterns = intentPrintToPatterns(intent.print);
    if (patterns.length) query.pattern = { $in: patterns };
  }
  if (!dropped.has('dressStyle') && intent.dressStyle) {
    const isBridalSearch = intent.occasion?.some((o) => ['bridal', 'wedding', 'mehndi'].includes(o));
    if (isBridalSearch) {
      // Many bridal products store subCategory='bridal' rather than dressStyle — match either
      query.$or = [
        { dressStyle: intent.dressStyle },
        { subCategory: { $in: ['bridal', 'festive'] } }
      ];
    } else if (intent.dressStyle === 'shalwar-kameez') {
      // Unstitched suits are often stored with empty dressStyle but correct subCategory
      query.$or = [
        { dressStyle: 'shalwar-kameez' },
        { subCategory: { $regex: /suit|kameez|unstitched/i } }
      ];
    } else {
      query.dressStyle = intent.dressStyle;
    }
  }
  if (!dropped.has('stitching') && intent.stitching) {
    if (intent.stitching === 'unstitched') query.stitchedType = 'unstitched';
    else query.stitchedType = { $in: ['stitched', 'semi-stitched'] };
  }
  if (!dropped.has('pieces') && intent.pieces) {
    query['pieceDetails.totalCount'] = intent.pieces;
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

const SELECT_CLOTHING =
  'name brand category subCategory dressStyle stitchedType pattern pieceType pieceDetails fashionType fabric price primaryColor colors primaryExactColor exactColors occasion style tags imageUrl images productUrl description gender metadataScore embedding';

async function fetchCandidates(intent) {
  const specified = getSpecifiedConstraints(intent);
  const relaxOrder = buildUnifiedRelaxOrder(intent.constraintPriority || []);

  const hasColor = specified.has('colorExact') || specified.has('colorFamily');
  let currentColorMode = specified.has('colorExact') ? 'exact'
    : specified.has('colorFamily') ? 'family'
    : 'none';

  const levels = [];
  const dropped = new Set();

  // Level 0: all specified constraints active
  levels.push({ dropped: new Set(), colorMode: currentColorMode, label: null });

  // Walk the relaxation order, executing only specified constraints
  for (const constraint of relaxOrder) {
    if (constraint === 'color') {
      if (!hasColor) continue;
      // Exact → family transition
      if (currentColorMode === 'exact') {
        if (specified.has('colorFamily')) {
          levels.push({ dropped: new Set(dropped), colorMode: 'family', label: 'colorExact' });
        }
        currentColorMode = 'family';
      }
      // Family → none
      levels.push({ dropped: new Set(dropped), colorMode: 'none', label: 'color' });
      currentColorMode = 'none';
    } else {
      if (!specified.has(constraint)) continue;
      dropped.add(constraint);
      levels.push({ dropped: new Set(dropped), colorMode: currentColorMode, label: constraint });
    }
  }

  let bestProducts = [];
  let relaxationMessage = null;
  let relaxedFields = [];

  for (const level of levels) {
    const query = buildDBQuery(intent, level.dropped, level.colorMode);
    const poolRaw = await ClothingProduct.find(query).select(SELECT_CLOTHING).limit(100).lean();
    const pool = poolRaw.map(formatClothingForApi);

    if (pool.length > bestProducts.length) {
      bestProducts = pool;
      relaxedFields = [...level.dropped];
      if (level.label === 'colorExact') {
        relaxedFields.push('exact color → showing color family');
      } else if (level.label === 'color') {
        relaxedFields.push('color');
      }
    }

    if (pool.length >= 20) break; // enough to rank — don't over-relax
  }

  // Build relaxation message for the frontend
  if (relaxedFields.length > 0) {
    const droppedFields = relaxedFields.filter((f) => !f.includes('→'));
    const colorNote = relaxedFields.find((f) => f.includes('→'));
    const parts = [];
    if (droppedFields.length) parts.push(`relaxed ${droppedFields.join(', ')}`);
    if (colorNote)            parts.push(colorNote);
    relaxationMessage = `No exact match found — ${parts.join('; ')}.`;
  }

  return { products: bestProducts, relaxationMessage, specified };
}

// ─── Quick local intent-match score (used to pre-sort before AI) ─────────────
function scoreAgainstIntent(product, intent) {
  let score = 0;
  if (intent.colorExact && product.exactColors?.some((c) => c.toLowerCase() === intent.colorExact.toLowerCase())) score += 3;
  else if (intent.colorFamily && intent.colorFamily !== 'Any' && product.primaryColor === intent.colorFamily) score += 2;
  if (intent.pieces    && product.pieces    === intent.pieces)    score += 2;
  if (intent.stitching && product.stitching === intent.stitching) score += 2;
  if (intent.dressStyle && product.dressStyle === intent.dressStyle) score += 4; // strongest signal — correct type always wins
  if (intent.print     && product.print     === intent.print)     score += 1;
  if (intent.fabric    && product.fabric?.toLowerCase().includes(intent.fabric.toLowerCase())) score += 1;
  if (intent.occasion?.length && product.occasion?.some((o) => intent.occasion.includes(o))) score += 1;
  if (intent.maxBudget > 0 && product.price <= intent.maxBudget) score += 1;
  // Penalise accessory-type products slipping through (mistagged in DB)
  if (intent.dressStyle && NON_OUTFIT_PATTERN.test(product.name || '')) score -= 5;
  return score;
}

// ─── Find one best shoe per dress ────────────────────────────────────────────
async function fetchShoePool() {
  // Catalog is clothing-only (single ClothingProduct collection for recommendations).
  return [];
}

function matchShoesFromPool(dresses, shoePool) {
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
  const { products, relaxationMessage } = await fetchCandidates(intent);

  if (!products.length) {
    return {
      results: [],
      matchQuality: { tier: 'none', message: "We couldn't find any products matching your request in our catalog." },
      relaxationMessage: null
    };
  }

  // 2. Local pre-sort — pick the best 20 to keep the AI prompt small and fast
  const presorted = products
    .map((p) => ({ p, s: scoreAgainstIntent(p, intent) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 20)
    .map(({ p }) => p);

  // 3. AI ranking + shoe pool fetch run in parallel
  const [ranked, shoePool] = await Promise.all([
    rankProductsWithAI(presorted, intent),
    fetchShoePool()
  ]);
  const top10 = ranked.slice(0, 10);

  // 4. Match shoes from the already-fetched pool (no extra DB call)
  const shoes = matchShoesFromPool(top10.map((r) => r.product), shoePool);

  // 5. Match quality tier
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
  const srcRaw = await ClothingProduct.findById(productId).lean();
  if (!srcRaw) throw new Error('Product not found');
  const source = formatClothingForApi(srcRaw);

  const baseQuery = { _id: { $ne: source._id } };

  const [shoePool, clothingPoolRaw] = await Promise.all([
    Promise.resolve([]),
    ClothingProduct.find(baseQuery).limit(100).lean()
  ]);
  const clothingPool = clothingPoolRaw.map(formatClothingForApi);

  const scoredShoes    = shoePool.map((c) => ({ product: c, scores: scoreProduct(source, c) })).sort((a, b) => b.scores.total - a.scores.total).slice(0, maxShoes);
  const scoredClothing = clothingPool.map((c) => ({ product: c, scores: scoreProduct(source, c) })).sort((a, b) => b.scores.total - a.scores.total).slice(0, maxClothing);

  return { source, shoes: scoredShoes, complementaryClothing: scoredClothing, generatedAt: new Date() };
}

export { scoreProductAgainstIntent, textualMatchScore } from './intentScoring.js';
