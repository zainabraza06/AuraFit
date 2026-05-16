/**
 * recommendationEngine.js
 *
 * Two public exports:
 *   getRecommendations(productId)   — product-detail-page outfit suggestions
 *   getOutfitForQuery(intent)       — "Style Me" chat-based outfit builder
 *
 * "Style Me" flow:
 *   0. If intent.searchCatalog is shoes / jewelry / watches, return only that catalog (no outfits).
 *   1. Build DB query from ONLY the fields the user specified (incl. optional season).
 *   2. Progressive constraint relaxation (respecting AI constraintPriority order).
 *   3. Top 20 candidates → LLM ranker → top 10 dresses with match reasons.
 *   4. Accessory plan uses the same hero as rank #1 (post-rank), then narrowed Mongo pools
 *      with row-count fallback; contrast-aware shoe; jewelry respects completionFocus;
 *      outfit completions respect completionFocus for top 3.
 *   5. Fast lexical catalog health on returned dresses (no per-request Hugging Face).
 */

import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import WatchProduct from '../models/WatchProduct.js';
import { formatClothingForApi, intentPrintToPatterns } from './productCompat.js';
import { getColorArrayCompatibility } from './colorTheory.js';
import { rankProductsWithAI } from './aiService.js';
import {
  planAccessorySearchFromContext,
  stripAccessoryPlanForClient
} from './accessorySearchPlanner.js';
import { escapeRegex } from '../utils/regexEscape.js';
import { bumpMetric, logRecommendationEvent } from './recommendationMetrics.js';
import { normalizeColor } from './colorNormalize.js';
import { pickBestShoe, pickJewelrySet, pickWatch } from './accessoryMatcher.js';
import { suggestOutfitCompletions } from './outfitCompletion.js';
import { summarizeCatalogHealth } from './catalogTaxonomyAudit.js';

import { CANONICAL_COLORS } from '../constants/catalogConstants.js';

export { CANONICAL_COLORS };
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
const DEFAULT_RELAX_ORDER = ['occasion', 'print', 'dressStyle', 'stitching', 'pieces', 'fabric', 'season', 'color'];

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
  if (intent.season)                                        specified.add('season');
  return specified;
}

// Accessory/non-outfit terms that should never appear as main outfit results
const NON_OUTFIT_PATTERN = /dupatta|stole|scarf|scarves|clutch|bag|jewelry|jewellery/i;

// ─── Contextual relaxation message ───────────────────────────────────────────
/**
 * Builds a human-readable explanation of what was relaxed and what's still matched,
 * using the actual values from the user's intent (not just constraint key names).
 *
 * relaxedFields entries:
 *   - regular key strings: 'print', 'dressStyle', 'stitching', 'pieces', 'fabric', 'occasion', 'season'
 *   - special: 'color' (fully dropped) or starts with 'exact color' (downgraded exact→family)
 */
function buildRelaxationMessage(intent, relaxedFields) {
  if (!relaxedFields.length) return null;

  const droppedKeys = new Set(
    relaxedFields.filter((f) => f !== 'color' && !f.startsWith('exact color'))
  );
  const colorFullyDropped = relaxedFields.includes('color');
  const colorDowngraded   = relaxedFields.some((f) => f.startsWith('exact color'));

  // ── What was relaxed ──
  const relaxedParts = [];

  if (droppedKeys.has('print'))
    relaxedParts.push(intent.print ? `${intent.print} work` : 'print/work');
  if (droppedKeys.has('dressStyle'))
    relaxedParts.push(intent.dressStyle ? `${intent.dressStyle} style` : 'dress style');
  if (droppedKeys.has('stitching'))
    relaxedParts.push(intent.stitching ? `${intent.stitching} type` : 'stitching');
  if (droppedKeys.has('pieces'))
    relaxedParts.push(intent.pieces ? `${intent.pieces}-piece` : 'piece count');
  if (droppedKeys.has('fabric'))
    relaxedParts.push(intent.fabric ? `${intent.fabric} fabric` : 'fabric');
  if (droppedKeys.has('occasion') && intent.occasion?.length)
    relaxedParts.push(`${intent.occasion.join('/')} occasion`);
  else if (droppedKeys.has('occasion'))
    relaxedParts.push('occasion');
  if (droppedKeys.has('season'))
    relaxedParts.push(intent.season ? `${intent.season} season` : 'season');

  if (colorDowngraded) {
    const exact  = intent.colorExact;
    const family = intent.colorFamily && intent.colorFamily !== 'Any' ? intent.colorFamily : null;
    relaxedParts.push(
      exact && family ? `exact ${exact} → showing ${family} shades` : 'exact shade → showing color family'
    );
  } else if (colorFullyDropped) {
    const col = intent.colorExact || (intent.colorFamily !== 'Any' ? intent.colorFamily : null);
    relaxedParts.push(col ? `${col} color` : 'color');
  }

  // ── What's still being applied ──
  const stillParts = [];
  const baseCol = intent.colorExact || (intent.colorFamily && intent.colorFamily !== 'Any' ? intent.colorFamily : null);

  if (!colorFullyDropped && !colorDowngraded && baseCol) stillParts.push(baseCol);
  if (colorDowngraded && intent.colorFamily && intent.colorFamily !== 'Any')
    stillParts.push(`${intent.colorFamily} shades`);
  if (!droppedKeys.has('print') && intent.print)         stillParts.push(intent.print);
  if (!droppedKeys.has('dressStyle') && intent.dressStyle) stillParts.push(intent.dressStyle);
  if (!droppedKeys.has('stitching') && intent.stitching) stillParts.push(intent.stitching);
  if (!droppedKeys.has('pieces') && intent.pieces)        stillParts.push(`${intent.pieces}-piece`);
  if (!droppedKeys.has('fabric') && intent.fabric)        stillParts.push(intent.fabric);
  if (!droppedKeys.has('occasion') && intent.occasion?.length)
    stillParts.push(intent.occasion.join('/'));
  if (!droppedKeys.has('season') && intent.season)        stillParts.push(intent.season);

  const relaxedStr = relaxedParts.join(', ');
  const stillStr   = stillParts.length
    ? ` Showing results that still match: ${stillParts.join(', ')}.`
    : '';
  return `No exact match — relaxed ${relaxedStr}.${stillStr}`;
}

// Build DB query for a given relaxation state
function buildDBQuery(intent, dropped, colorMode) {
  const query = {
    category: 'clothing',
    inStock:  { $ne: false },   // exclude products marked out-of-stock by the scraper
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
    const safe = escapeRegex(String(intent.fabric).trim());
    if (safe) query.fabric = { $regex: new RegExp(safe, 'i') };
  }

  if (!dropped.has('season') && intent.season) {
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { season: intent.season },
        { season: 'all-season' },
        { season: { $exists: false } },
        { season: { $size: 0 } }
      ]
    });
  }

  // Color — exact shade → canonical family → none
  if (colorMode === 'exact' && intent.colorExact) {
    const safe = escapeRegex(String(intent.colorExact).trim());
    if (safe) query.exactColors = { $elemMatch: { $regex: new RegExp(`^${safe}$`, 'i') } };
  } else if (colorMode === 'family' && intent.colorFamily && intent.colorFamily !== 'Any') {
    query.primaryColor = intent.colorFamily;
  }
  // colorMode === 'none': no color filter

  return query;
}

const SELECT_CLOTHING =
  'name brand category subCategory dressStyle stitchedType pattern pieceType pieceDetails fashionType fabric price primaryColor colors primaryExactColor exactColors occasion season style tags imageUrl images productUrl description gender metadataScore embedding';

const SELECT_SHOE =
  'name brand price images primaryColor colors occasion shoeType subCategory gender productUrl style embedding';
const SELECT_JEWELRY =
  'name brand price images primaryColor colors occasion jewelryType jewelryCategory metalFinish stoneWork gender productUrl description tags';
const SELECT_WATCH =
  'name brand price images primaryColor colors occasion watchType dialColor strapType gender productUrl description tags';

async function fetchAccessoryPools(intent, plan = null) {
  const genderFilter =
    intent.gender && intent.gender !== 'unisex'
      ? { gender: { $in: [intent.gender, 'unisex'] } }
      : {};
  const budget =
    intent.maxBudget > 0 ? { price: { $lte: Math.round(intent.maxBudget * 1.35) } } : {};
  const base = { ...genderFilter, ...budget, inStock: { $ne: false } };

  const shoeNarrow = plan?.shoeTypes?.length ? { ...base, shoeType: { $in: plan.shoeTypes } } : null;
  const jewelryNarrow = plan?.jewelryTypes?.length ? { ...base, jewelryType: { $in: plan.jewelryTypes } } : null;
  const watchNarrow = plan?.watchTypes?.length ? { ...base, watchType: { $in: plan.watchTypes } } : null;

  let shoes = await ShoeProduct.find(shoeNarrow || base).select(SELECT_SHOE).limit(100).lean();
  if (shoeNarrow && shoes.length < 10) {
    bumpMetric('accessory_pool_shoe_fallback');
    logRecommendationEvent({
      event: 'accessory_pool_fallback',
      category: 'shoe',
      narrowedCount: shoes.length
    });
    shoes = await ShoeProduct.find(base).select(SELECT_SHOE).limit(100).lean();
  }

  let jewelry = await JewelryProduct.find(jewelryNarrow || base).select(SELECT_JEWELRY).limit(90).lean();
  if (jewelryNarrow && jewelry.length < 8) {
    bumpMetric('accessory_pool_jewelry_fallback');
    logRecommendationEvent({
      event: 'accessory_pool_fallback',
      category: 'jewelry',
      narrowedCount: jewelry.length
    });
    jewelry = await JewelryProduct.find(base).select(SELECT_JEWELRY).limit(90).lean();
  }

  let watches = await WatchProduct.find(watchNarrow || base).select(SELECT_WATCH).limit(70).lean();
  if (watchNarrow && watches.length < 5) {
    bumpMetric('accessory_pool_watch_fallback');
    logRecommendationEvent({
      event: 'accessory_pool_fallback',
      category: 'watch',
      narrowedCount: watches.length
    });
    watches = await WatchProduct.find(base).select(SELECT_WATCH).limit(70).lean();
  }

  return { shoes, jewelry, watches };
}

/** Mongo filter for dedicated shoe / jewelry / watch catalog search (no clothing). */
function buildAccessoryOnlyDbQuery(intent) {
  const genderFilter =
    intent.gender && intent.gender !== 'unisex'
      ? { gender: { $in: [intent.gender, 'unisex'] } }
      : {};
  const budget =
    intent.maxBudget > 0 ? { price: { $lte: Math.round(intent.maxBudget * 1.35) } } : {};
  const q = { ...genderFilter, ...budget, inStock: { $ne: false } };

  if (intent.colorFamily && intent.colorFamily !== 'Any') {
    q.primaryColor = intent.colorFamily;
  }

  if (intent.occasion?.length) {
    q.$or = [
      { occasion: { $in: intent.occasion } },
      { occasion: { $exists: false } },
      { occasion: { $size: 0 } }
    ];
  }

  return q;
}

function scoreAccessoryAgainstIntent(p, intent) {
  let s = 0;
  if (intent.colorFamily && intent.colorFamily !== 'Any' && p.primaryColor === intent.colorFamily) {
    s += 3;
  }
  const occI = (intent.occasion || []).map((o) => String(o).toLowerCase());
  const occP = (p.occasion || []).map((o) => String(o).toLowerCase());
  if (occI.length && occP.some((o) => occI.includes(o))) s += 2;
  if (intent.maxBudget > 0 && typeof p.price === 'number' && p.price <= intent.maxBudget) s += 1;
  return s;
}

function accessoryMatchReason(p, intent) {
  const bits = [];
  if (intent.colorFamily && intent.colorFamily !== 'Any' && p.primaryColor === intent.colorFamily) {
    bits.push('color');
  }
  const occI = (intent.occasion || []).map((o) => String(o).toLowerCase());
  if (occI.length && (p.occasion || []).some((o) => occI.includes(String(o).toLowerCase()))) {
    bits.push('occasion');
  }
  if (!bits.length) return 'From our catalog matching your filters.';
  return `Strong ${bits.join(' & ')} match for your search.`;
}

/**
 * User asked for shoes / jewelry / watches only — no outfit or cross-category recommendations.
 * @param {'shoes'|'jewelry'|'watches'} catalog
 */
async function getAccessoryOnlyOutfitResponse(intent, catalog) {
  bumpMetric('accessory_only_query');
  logRecommendationEvent({ event: 'accessory_only_flow', searchCatalog: catalog });

  const baseQuery = buildAccessoryOnlyDbQuery(intent);
  const limitFetch = 100;
  const limitOut = 30;

  const Model =
    catalog === 'shoes' ? ShoeProduct : catalog === 'jewelry' ? JewelryProduct : WatchProduct;
  const select =
    catalog === 'shoes' ? SELECT_SHOE : catalog === 'jewelry' ? SELECT_JEWELRY : SELECT_WATCH;

  let raw = await Model.find(baseQuery).select(select).limit(limitFetch).lean();

  if (raw.length < 12 && baseQuery.primaryColor) {
    const relaxed = { ...baseQuery };
    delete relaxed.primaryColor;
    raw = await Model.find(relaxed).select(select).limit(limitFetch).lean();
  }
  if (raw.length < 8 && baseQuery.$or) {
    const relaxed = { ...baseQuery };
    delete relaxed.$or;
    raw = await Model.find(relaxed).select(select).limit(limitFetch).lean();
  }

  const scored = raw
    .map((p) => ({ p, s: scoreAccessoryAgainstIntent(p, intent) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limitOut);

  const results = scored.map(({ p }, idx) => ({
    product: p,
    rank: idx + 1,
    matchReason: accessoryMatchReason(p, intent),
    shoe: null,
    jewelry: [],
    watch: null,
    outfitCompletions: []
  }));

  const tier = results.length >= 20 ? 'exact' : results.length >= 8 ? 'close' : results.length ? 'similar' : 'none';

  return {
    accessoryOnly: true,
    searchCatalog: catalog,
    results,
    matchQuality: {
      tier,
      totalFound: results.length,
      message: results.length
        ? null
        : "We couldn't find any matching items in our catalog for this search."
    },
    relaxationMessage: null,
    catalogExtractionHealth: { avgLexicalAlignment: 1, perItem: [] },
    intentEcho: {
      constraintPriority: intent.constraintPriority || [],
      season: intent.season || null,
      searchCatalog: catalog
    },
    accessoryRetrievalPlan: null
  };
}

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

  relaxationMessage = buildRelaxationMessage(intent, relaxedFields);

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
  if (intent.season && (product.season || []).some((s) => s === intent.season || s === 'all-season')) score += 1;
  if (intent.maxBudget > 0 && product.price <= intent.maxBudget) score += 1;
  // Penalise accessory-type products slipping through (mistagged in DB)
  if (intent.dressStyle && NON_OUTFIT_PATTERN.test(product.name || '')) score -= 5;
  return score;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Chat-based "Style Me" outfit builder
// ═══════════════════════════════════════════════════════════════════════════════
export async function getOutfitForQuery(intent) {
  const catalog = intent.searchCatalog || 'clothing';
  if (catalog === 'shoes' || catalog === 'jewelry' || catalog === 'watches') {
    return getAccessoryOnlyOutfitResponse(intent, catalog);
  }

  // 1. Fetch candidates via progressive relaxation
  const { products, relaxationMessage } = await fetchCandidates(intent);

  if (!products.length) {
    return {
      results: [],
      accessoryOnly: false,
      searchCatalog: 'clothing',
      matchQuality: { tier: 'none', message: "We couldn't find any products matching your request in our catalog." },
      relaxationMessage: null,
      catalogExtractionHealth: { avgLexicalAlignment: 1, perItem: [] },
      intentEcho: {
        constraintPriority: intent.constraintPriority || [],
        season: intent.season || null,
        searchCatalog: 'clothing'
      },
      accessoryRetrievalPlan: null
    };
  }

  // 2. Local pre-sort — pick the best 20 to keep the AI prompt small and fast
  const presorted = products
    .map((p) => ({ p, s: scoreAgainstIntent(p, intent) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 20)
    .map(({ p }) => p);

  // 3. AI dress rank first so accessory plan uses the same hero the user sees at #1
  const tRank = Date.now();
  const ranked = await rankProductsWithAI(presorted, intent);
  logRecommendationEvent({
    event: 'style_me_rank_ms',
    ms: Date.now() - tRank,
    candidateCount: presorted.length
  });

  const heroDress = ranked[0]?.product || presorted[0] || null;
  const tPlan = Date.now();
  const accessoryPlan = await planAccessorySearchFromContext(intent, heroDress);
  logRecommendationEvent({
    event: 'style_me_accessory_plan_ms',
    ms: Date.now() - tPlan,
    planNull: !accessoryPlan
  });

  const pools = await fetchAccessoryPools(intent, accessoryPlan);
  const top10 = ranked.slice(0, 10);
  const dressRows = top10.map((r) => r.product);

  const catalogExtractionHealth = summarizeCatalogHealth(dressRows);

  const usedShoeIds = new Set();
  const heavyJewel = (intent.occasion || []).some((o) =>
    ['wedding', 'bridal', 'mehndi', 'eid', 'party'].includes(String(o).toLowerCase())
  );

  const results = [];
  for (let i = 0; i < top10.length; i++) {
    const r = top10[i];
    const dress = r.product;
    const shoePick = pickBestShoe(dress, pools.shoes, usedShoeIds);
    const jewelry = pickJewelrySet(dress, intent.occasion, pools.jewelry, {
      maxItems: heavyJewel ? 6 : 3,
      completionFocus: accessoryPlan?.completionFocus || []
    });
    const watch = pickWatch(dress, intent.occasion, pools.watches);
    const outfitCompletions =
      i < 3 ? await suggestOutfitCompletions(dress, intent, accessoryPlan) : [];

    results.push({
      product: dress,
      rank: r.rank,
      matchReason: r.reason,
      shoe: shoePick
        ? {
            product: shoePick.product,
            score: shoePick.score,
            reason: shoePick.reason
          }
        : null,
      jewelry,
      watch,
      outfitCompletions
    });
  }

  const tier = !relaxationMessage ? 'exact'
    : top10.length >= 8 ? 'close'
    : top10.length >= 4 ? 'similar'
    : 'loose';

  return {
    accessoryOnly: false,
    searchCatalog: 'clothing',
    results,
    matchQuality: {
      tier,
      totalFound: products.length,
      message: relaxationMessage
    },
    relaxationMessage,
    catalogExtractionHealth,
    intentEcho: {
      constraintPriority: intent.constraintPriority || [],
      season: intent.season || null,
      searchCatalog: 'clothing'
    },
    accessoryRetrievalPlan: stripAccessoryPlanForClient(accessoryPlan)
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

  const baseQuery = { _id: { $ne: source._id }, inStock: { $ne: false } };

  const pools = await fetchAccessoryPools({ gender: source.gender, maxBudget: 0 });
  const shoePool = pools.shoes;

  const clothingPoolRaw = await ClothingProduct.find(baseQuery).limit(100).lean();
  const clothingPool = clothingPoolRaw.map(formatClothingForApi);

  const scoredShoes    = shoePool.map((c) => ({ product: c, scores: scoreProduct(source, c) })).sort((a, b) => b.scores.total - a.scores.total).slice(0, maxShoes);
  const scoredClothing = clothingPool.map((c) => ({ product: c, scores: scoreProduct(source, c) })).sort((a, b) => b.scores.total - a.scores.total).slice(0, maxClothing);

  return { source, shoes: scoredShoes, complementaryClothing: scoredClothing, generatedAt: new Date() };
}

export { scoreProductAgainstIntent, textualMatchScore } from './intentScoring.js';
