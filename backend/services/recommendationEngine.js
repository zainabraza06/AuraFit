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
import { rankProductsWithAI, planNextRelaxation, rankShoesWithAI, rankComplementaryClothingWithAI } from './aiService.js';
import { deriveDressStyle, deriveFabric } from '../scripts/scrapers/parsers/productParser.js';
import { deriveShoeGender, deriveShoeType } from '../scripts/scrapers/parsers/shoeParser.js';
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
const DEFAULT_RELAX_ORDER = ['neckline', 'occasion', 'print', 'dressStyle', 'stitching', 'pieces', 'fabric', 'season', 'color'];

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
  if (intent.neckline)                                      specified.add('neckline');
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

  if (droppedKeys.has('neckline'))
    relaxedParts.push(intent.neckline ? `${intent.neckline} neckline` : 'neckline');
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
  if (!droppedKeys.has('neckline') && intent.neckline)   stillParts.push(`${intent.neckline} neckline`);
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

  // Hard constraints — always applied, NEVER relaxed (gender, budget).
  if (intent.gender && intent.gender !== 'women' && intent.gender !== 'unisex') {
    query.gender = intent.gender;
  }
  // "under 5k" is a hard ceiling: we never silently show over-budget items. If
  // nothing fits, the caller tells the user to raise their budget instead.
  if (intent.maxBudget > 0 && !dropped.has('budget')) {
    query.price = { $lte: intent.maxBudget };
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
    // A DISTINCTIVE silhouette must match strictly — a "bridal lehenga" search must
    // NOT return bridal shalwar-kameez suits just because they share the occasion.
    const DISTINCTIVE = ['lehenga', 'saree', 'gown', 'frock', 'maxi', 'abaya', 'sharara', 'gharara', 'palazzo'];
    const isBridalSearch = intent.occasion?.some((o) => ['bridal', 'wedding', 'mehndi'].includes(o));
    if (DISTINCTIVE.includes(intent.dressStyle)) {
      query.dressStyle = intent.dressStyle;
    } else if (intent.dressStyle === 'shalwar-kameez') {
      // The generic suit is often stored via subCategory rather than dressStyle.
      query.$or = isBridalSearch
        ? [{ dressStyle: 'shalwar-kameez' }, { subCategory: { $in: ['bridal', 'festive'] } }]
        : [{ dressStyle: 'shalwar-kameez' }, { subCategory: { $regex: /suit|kameez|unstitched/i } }];
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
  // Neckline: the structured field only covers ~12% of the catalog, so also match
  // the (more common) mention of it in free-text descriptions — a soft signal, not
  // a strict filter, which is why it's always dropped first during relaxation.
  if (!dropped.has('neckline') && intent.neckline) {
    const safe = escapeRegex(String(intent.neckline).trim());
    const textPattern = new RegExp(safe.replace(/-/g, '[\\s-]?'), 'i');
    query.$and = query.$and || [];
    query.$and.push({ $or: [{ neckline: intent.neckline }, { description: { $regex: textPattern } }] });
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
  'name brand category subCategory dressStyle stitchedType pattern pieceType pieceDetails fashionType fabric price primaryColor colors primaryExactColor exactColors occasion season style tags imageUrl images productUrl description neckline gender metadataScore embedding';

const SELECT_SHOE =
  'name brand price images primaryColor primaryExactColor colors occasion shoeType subCategory gender tags productUrl style embedding description';
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
  shoes = await healShoeDrift(shoes);

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

// Map a user's shoe-type word → the specific shoeType values it should match.
// (Matches shoeType only — it's title-derived and reliable; subCategory buckets
// like 'ethnic' are too broad and drag in unrelated silhouettes.)
const SHOE_TYPE_MATCH = [
  { kw: ['heel', 'heels', 'stiletto', 'stilettos', 'court'], types: ['heel', 'stiletto', 'block-heel', 'court-shoe', 'pump'] },
  { kw: ['pump', 'pumps'], types: ['pump', 'court-shoe', 'heel'] },
  { kw: ['wedge', 'wedges'], types: ['wedge', 'platform'] },
  { kw: ['sandal', 'sandals'], types: ['sandal', 'slide'] },
  { kw: ['khussa', 'khussay', 'kolhapuri', 'peshawari', 'kohati'], types: ['khussa', 'kolhapuri', 'peshawari', 'kohati'] },
  { kw: ['sneaker', 'sneakers', 'jogger', 'joggers', 'trainer', 'running', 'athletic'], types: ['sneaker', 'trainer', 'jogger', 'running'] },
  { kw: ['flat', 'flats', 'ballet', 'ballerina', 'loafer', 'loafers', 'moccasin'], types: ['flat', 'ballet-flat', 'loafer', 'moccasin', 'espadrille'] },
  { kw: ['mule', 'mules', 'back open', 'back-open'], types: ['mule'] },
  { kw: ['slipper', 'slippers', 'chappal', 'chappals'], types: ['slipper', 'chappal', 'flip-flop'] },
  { kw: ['boot', 'boots', 'ankle boot', 'chelsea'], types: ['boot', 'ankle-boot', 'chelsea-boot', 'long-boot', 'combat'] }
];

/** The specific shoeType values a user's shoe-type word should match (or null). */
function shoeTypesFor(accessoryType) {
  if (!accessoryType) return null;
  const t = String(accessoryType).toLowerCase();
  const m = SHOE_TYPE_MATCH.find((r) => r.kw.some((k) => t.includes(k)));
  return m ? m.types : null;
}

/** Add a type filter (shoeType or jewelryType) for a dedicated accessory search. */
function accessoryTypeFilter(catalog, accessoryType) {
  if (!accessoryType) return null;
  const t = String(accessoryType).toLowerCase();
  if (catalog === 'shoes') {
    const m = SHOE_TYPE_MATCH.find((r) => r.kw.some((k) => t.includes(k)));
    if (m) return { shoeType: { $in: m.types } };
  } else if (catalog === 'jewelry') {
    const map = { earring: 'ear', jhumka: 'ear', necklace: 'neck', choker: 'neck', ring: 'hand', bracelet: 'wrist', bangle: 'wrist', anklet: 'wrist', bridal: 'bridal', tikka: 'head' };
    const key = Object.keys(map).find((k) => t.includes(k));
    if (key) return { $or: [{ jewelryType: { $regex: new RegExp(escapeRegex(t), 'i') } }, { subCategory: map[key] }] };
  } else if (catalog === 'watches') {
    return { watchType: { $regex: new RegExp(escapeRegex(t), 'i') } };
  }
  return null;
}

/**
 * Mongo filter for a dedicated shoe / jewelry / watch search (no clothing).
 * `dropped` may contain 'color', 'occasion', 'type' — budget & gender stay hard.
 */
function buildAccessoryOnlyDbQuery(intent, catalog, dropped = new Set()) {
  const q = { inStock: { $ne: false } };
  if (intent.gender && intent.gender !== 'unisex') q.gender = { $in: [intent.gender, 'unisex'] };
  if (intent.maxBudget > 0) q.price = { $lte: intent.maxBudget };            // hard ceiling
  if (!dropped.has('color') && intent.colorFamily && intent.colorFamily !== 'Any') {
    q.primaryColor = intent.colorFamily;
  }

  const ands = [];
  if (!dropped.has('type')) {
    const tf = accessoryTypeFilter(catalog, intent.accessoryType);
    if (tf) ands.push(tf);
  }
  if (!dropped.has('occasion') && intent.occasion?.length) {
    ands.push({ $or: [{ occasion: { $in: intent.occasion } }, { occasion: { $exists: false } }, { occasion: { $size: 0 } }] });
  }
  if (ands.length === 1) Object.assign(q, ands[0]);
  else if (ands.length > 1) q.$and = ands;
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

// Honest accessory reason — states matches and mismatches, never over-claims.
function accessoryMatchReason(p, intent) {
  const matched = [];
  const missed = [];
  if (intent.colorFamily && intent.colorFamily !== 'Any') {
    if (p.primaryColor === intent.colorFamily) matched.push(`${p.primaryColor} colour`);
    else missed.push(`colour is ${p.primaryExactColor || p.primaryColor || 'unknown'}, not ${intent.colorFamily}`);
  }
  const occI = (intent.occasion || []).map((o) => String(o).toLowerCase());
  if (occI.length) {
    const shared = (p.occasion || []).filter((o) => occI.includes(String(o).toLowerCase()));
    if (shared.length) matched.push(`${shared.slice(0, 2).join('/')} occasion`);
    else missed.push(`for ${(p.occasion || []).slice(0, 2).join('/') || 'general'} wear, not ${occI.join('/')}`);
  }
  if (intent.maxBudget > 0 && typeof p.price === 'number') {
    if (p.price <= intent.maxBudget) matched.push(`within PKR ${intent.maxBudget}`);
    else missed.push(`PKR ${p.price}, over your PKR ${intent.maxBudget}`);
  }
  if (missed.length && matched.length) return `Matches ${matched.join(', ')}; but ${missed.join(', ')}.`;
  if (missed.length) return `Closest we have — ${missed.join(', ')}.`;
  if (matched.length) return `Matches your search: ${matched.join(', ')}.`;
  return 'From our catalog matching your filters.';
}

// Casual-silhouette shoeTypes whose title/construction implies everyday wear —
// used to backfill a missing 'casual' occasion tag (collection-level occasion
// metadata sometimes tags these as eid/wedding/mehndi purely from the source
// collection page, contradicting the product's own name/construction).
const CASUAL_SHOE_TYPES = new Set(['sneaker', 'trainer', 'jogger', 'running', 'flat', 'slipper', 'chappal', 'slide', 'flip-flop']);

// Self-heal shoe field drift (gender/shoeType/missing-casual-occasion) and drop non-women from results.
async function healShoeDrift(rawDocs) {
  const ops = [];
  const kept = [];
  for (const d of rawDocs) {
    const g = deriveShoeGender(d.name, d.tags);
    if (g === 'men' || g === 'kids') {
      ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { gender: g } } } });
      continue; // not women's — exclude from this women's catalog
    }
    const set = {};
    const st = deriveShoeType(d.name, d.tags, d.subCategory);
    if (st && st !== 'other' && st !== d.shoeType) { d.shoeType = st; set.shoeType = st; }

    // Additive only — never removes existing occasion tags, just fills an
    // evidenced gap so honest occasion-match scoring isn't starved.
    const occ = (d.occasion || []).map((o) => String(o).toLowerCase());
    const nameIsCasual = /\bcasual\b/i.test(d.name || '');
    const typeIsCasual = CASUAL_SHOE_TYPES.has(d.shoeType);
    if ((nameIsCasual || typeIsCasual) && !occ.includes('casual')) {
      const newOcc = [...(d.occasion || []), 'casual'];
      d.occasion = newOcc;
      set.occasion = newOcc;
    }

    if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: set } } });
    kept.push(d);
  }
  if (ops.length) {
    try { await ShoeProduct.bulkWrite(ops, { ordered: false }); }
    catch (e) { console.warn('[healShoeDrift] bulkWrite failed:', e.message); }
    logRecommendationEvent({ event: 'self_heal_shoes', corrected: ops.length });
  }
  return kept;
}

/**
 * User asked for shoes / jewelry / watches only — no outfit or cross-category recommendations.
 * @param {'shoes'|'jewelry'|'watches'} catalog
 */
async function getAccessoryOnlyOutfitResponse(intent, catalog) {
  bumpMetric('accessory_only_query');
  logRecommendationEvent({ event: 'accessory_only_flow', searchCatalog: catalog });

  const limitFetch = 100;
  const limitOut = 30;

  const Model =
    catalog === 'shoes' ? ShoeProduct : catalog === 'jewelry' ? JewelryProduct : WatchProduct;
  const select =
    catalog === 'shoes' ? SELECT_SHOE : catalog === 'jewelry' ? SELECT_JEWELRY : SELECT_WATCH;

  // Relax least-important first, keeping the TYPE (heels/khussa/…) longest. Budget
  // stays a hard ceiling. Stop at the tightest level that has any matches.
  const relaxSteps = [
    { drop: new Set(), label: null },
    { drop: new Set(['color']), label: 'colour' },
    { drop: new Set(['color', 'occasion']), label: 'occasion' },
    { drop: new Set(['color', 'occasion', 'type']), label: intent.accessoryType || 'type' }
  ];
  let raw = [];
  let relaxedLabel = null;
  for (const step of relaxSteps) {
    let batch = await Model.find(buildAccessoryOnlyDbQuery(intent, catalog, step.drop)).select(select).limit(limitFetch).lean();
    if (catalog === 'shoes') {
      batch = await healShoeDrift(batch);
      // Re-apply the type filter AFTER healing: a shoe the DB had mislabeled as a
      // heel that heals to 'sandal' must drop out of a "heels" search this same
      // request (keeps type-specific results honest — mirrors clothing dressStyle).
      if (!step.drop.has('type')) {
        const types = shoeTypesFor(intent.accessoryType);
        if (types) batch = batch.filter((s) => types.includes(s.shoeType));
      }
    }
    if (batch.length) { raw = batch; relaxedLabel = step.drop.size ? step.label : null; break; }
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

  const tier = !relaxedLabel && results.length ? 'exact' : results.length >= 8 ? 'close' : results.length ? 'similar' : 'none';
  const noun = catalog === 'shoes' ? (intent.accessoryType || 'footwear') : catalog === 'jewelry' ? (intent.accessoryType || 'jewellery') : 'watches';
  const relaxationMessage = relaxedLabel
    ? `No exact ${intent.accessoryType || ''} match — relaxed ${relaxedLabel}. Showing the closest ${noun} we have.`
    : null;

  return {
    accessoryOnly: true,
    searchCatalog: catalog,
    results,
    matchQuality: {
      tier,
      totalFound: results.length,
      message: results.length
        ? relaxationMessage
        : `We couldn't find any ${intent.maxBudget ? `${noun} under PKR ${intent.maxBudget.toLocaleString()}` : noun} matching your search.`
    },
    relaxationMessage,
    catalogExtractionHealth: { avgLexicalAlignment: 1, perItem: [] },
    intentEcho: {
      constraintPriority: intent.constraintPriority || [],
      season: intent.season || null,
      searchCatalog: catalog
    },
    accessoryRetrievalPlan: null
  };
}

// ─── Agentic retrieval loop ──────────────────────────────────────────────────
// Iteratively refines the search: each round the LLM sees the ACTUAL catalog
// counts for every possible next move and decides ONE honest step — relax the
// least-important filter, tell the shopper to raise their budget, accept, or stop.
// Falls back to the deterministic fetchCandidatesDeterministic() if the LLM is unavailable.
const RELAXABLE = ['neckline', 'occasion', 'print', 'dressStyle', 'stitching', 'pieces', 'fabric', 'season'];
// 'sharara'/'gharara' deliberately absent — they're wide-leg trouser styles worn
// with a kurta (structurally a kurta/shalwar-kameez silhouette, not a distinct
// skirt-based style), and no code path ever sets intent.dressStyle to those
// values (searchQueryIntel.js's QUERY_GARMENT_MAP maps them to 'kurta').
const DISTINCTIVE_STYLES = ['lehenga', 'saree', 'gown', 'frock', 'maxi', 'abaya', 'palazzo'];
const TARGET_RESULTS = 8;
// One round can only drop ONE constraint, so the budget must cover the worst
// case: every RELAXABLE constraint specified at once, plus color's own two-step
// path (exact shade → color family → no color filter). A rich stylist-generated
// query (color + occasion + dressStyle + neckline + stitching + pieces + fabric
// + season) can legitimately specify all of RELAXABLE simultaneously — 4 rounds
// was proven too few in testing, silently returning 0 results after exhausting
// the budget instead of continuing to relax down to a real match.
const MAX_ROUNDS = RELAXABLE.length + 2;

// ─── Self-healing: re-derive drift-prone fields from each product's own text and
// write corrections back to the DB. The catalog heals through normal usage — a
// "Tunic" mislabeled dressStyle=lehenga is fixed the first time a search touches it.
async function healClothingDrift(rawDocs) {
  const ops = [];
  for (const d of rawDocs) {
    const set = {};
    const ds = deriveDressStyle(d.name, d.subCategory);
    if ((ds || null) !== (d.dressStyle || null)) { set.dressStyle = ds; d.dressStyle = ds; }
    const fab = deriveFabric(d.name, d.description);
    if (fab && fab !== d.fabric) { set.fabric = fab; d.fabric = fab; }
    if (Object.keys(set).length) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: set } } });
  }
  if (ops.length) {
    try { await ClothingProduct.bulkWrite(ops, { ordered: false }); }
    catch (e) { console.warn('[healClothingDrift] bulkWrite failed:', e.message); }
    logRecommendationEvent({ event: 'self_heal_clothing', corrected: ops.length });
  }
  return ops.length;
}

// Fetch a candidate pool, heal field drift in-place + in the DB, then re-apply a
// DISTINCTIVE dressStyle filter (a product healed away from 'lehenga' must drop out
// of a lehenga search this same request).
async function fetchHealedPool(intent, dropped, colorMode) {
  const raw = await ClothingProduct.find(buildDBQuery(intent, dropped, colorMode))
    .select(SELECT_CLOTHING).limit(100).lean();
  await healClothingDrift(raw);
  let pool = raw.map(formatClothingForApi);
  if (!dropped.has('dressStyle') && intent.dressStyle && DISTINCTIVE_STYLES.includes(intent.dressStyle)) {
    pool = pool.filter((p) => p.dressStyle === intent.dressStyle);
  }
  return pool;
}

async function countFor(intent, dropped, colorMode) {
  return ClothingProduct.countDocuments(buildDBQuery(intent, dropped, colorMode));
}

function relaxLabel(intent, c) {
  if (c === 'neckline') return intent.neckline || 'neckline';
  if (c === 'pieces') return intent.pieces ? `${intent.pieces}-piece` : 'piece count';
  if (c === 'print') return intent.print || 'print/work';
  if (c === 'stitching') return intent.stitching || 'stitching';
  if (c === 'dressStyle') return intent.dressStyle || 'dress style';
  if (c === 'occasion') return (intent.occasion || []).join('/') || 'occasion';
  if (c === 'fabric') return intent.fabric || 'fabric';
  if (c === 'season') return intent.season || 'season';
  if (c === 'color') return intent.colorExact || intent.colorFamily || 'colour';
  return c;
}

export async function agenticRelax(intent) {
  const specified = getSpecifiedConstraints(intent);
  const dropped = new Set();
  let colorMode = specified.has('colorExact') ? 'exact' : specified.has('colorFamily') ? 'family' : 'none';
  const trace = [];
  const relaxedFields = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const pool = await fetchHealedPool(intent, dropped, colorMode);

    // Show WHAT IS FOUND — accept the tightest level that has ANY matches, however
    // few. We never pad a 3-result query up to 10 by relaxing; we only step down
    // when a level returns zero.
    if (pool.length >= 1) {
      return { products: pool, relaxedFields, trace, relaxationMessage: buildRelaxationMessage(intent, relaxedFields), budgetBlock: null };
    }

    // Candidate next moves (only constraints the user actually specified & not yet dropped).
    // relaxOptionsList mirrors relaxOptions but keeps the real constraint key
    // (not just its display label) so the DISTINCTIVE-style override below can
    // reliably find "any alternative that isn't dressStyle", independent of
    // what the label text happens to say.
    const relaxOptions = {};
    const relaxOptionsList = [];
    for (const c of RELAXABLE) {
      if (specified.has(c) && !dropped.has(c)) {
        const label = relaxLabel(intent, c);
        const count = await countFor(intent, new Set([...dropped, c]), colorMode);
        relaxOptions[label] = count;
        relaxOptionsList.push({ constraint: c, count });
      }
    }
    let colorCount = null;
    if (colorMode !== 'none') {
      const nextMode = colorMode === 'exact' && specified.has('colorFamily') ? 'family' : 'none';
      colorCount = await countFor(intent, dropped, nextMode);
      relaxOptions[`colour (${relaxLabel(intent, 'color')})`] = colorCount;
    }
    // Budget probe — keep all current filters, lift only the price ceiling.
    let budgetLift = null, cheapest = null;
    if (intent.maxBudget > 0) {
      const bq = buildDBQuery(intent, new Set([...dropped, 'budget']), colorMode);
      budgetLift = await ClothingProduct.countDocuments(bq);
      const cheap = await ClothingProduct.find(bq).select('price').sort({ price: 1 }).limit(1).lean();
      cheapest = cheap[0]?.price ?? null;
    }

    const activeLabels = [...specified]
      .filter((c) => !dropped.has(c) && c !== 'colorExact' && c !== 'colorFamily')
      .map((c) => relaxLabel(intent, c));
    if (colorMode !== 'none') activeLabels.unshift(relaxLabel(intent, 'color'));

    const decision = await planNextRelaxation({
      message: intent.originalMessage || intent.intentSummary || 'a fashion search',
      active: activeLabels,
      dropped: relaxedFields,
      maxBudget: intent.maxBudget || 0,
      current: pool.length,
      relaxOptions,
      budgetLift,
      cheapest,
      round
    });

    // LLM unavailable → deterministic fallback for the rest.
    if (!decision) return fetchCandidatesDeterministic(intent);

    trace.push(decision);

    if (decision.action === 'accept' || decision.action === 'stop') {
      // pool is empty here (the >=1 check above already returned otherwise) — never
      // echo an LLM message implying results were shown when there are none.
      const honestMessage = pool.length
        ? (decision.message || buildRelaxationMessage(intent, relaxedFields))
        : "We couldn't find anything matching your request, even after relaxing every filter we could.";
      return { products: pool, relaxedFields, trace, relaxationMessage: honestMessage, budgetBlock: null };
    }
    if (decision.action === 'raise_budget') {
      return {
        products: [], relaxedFields, trace,
        message: decision.message,
        budgetBlock: { maxBudget: intent.maxBudget, cheapest, activeLabels }
      };
    }
    // relax the chosen constraint (match against our labels)
    let target = RELAXABLE.find((c) => specified.has(c) && !dropped.has(c) &&
      String(decision.constraint || '').toLowerCase().includes(relaxLabel(intent, c).toLowerCase().split(' ')[0]));
    let relaxingColor = String(decision.constraint || '').toLowerCase().includes('colo') && colorMode !== 'none';

    // Hard override: planNextRelaxation is a per-call LLM judgment and has been
    // observed to be non-deterministic on which constraint "matters more" —
    // sometimes correctly relaxing color, sometimes wrongly dropping the exact
    // silhouette noun the user named (e.g. "maroon lehenga" → drops "lehenga"
    // and returns shalwar-kameez suits instead of just widening the color).
    // A DISTINCTIVE style word is the defining noun of the search; never let it
    // be the first thing sacrificed while any other relaxable option —
    // including color — still has real results.
    if (target === 'dressStyle' && DISTINCTIVE_STYLES.includes(intent.dressStyle)) {
      if (colorMode !== 'none' && colorCount > 0) {
        target = null;
        relaxingColor = true;
      } else {
        const betterAlt = relaxOptionsList
          .filter((o) => o.constraint !== 'dressStyle' && o.count > 0)
          .sort((a, b) => b.count - a.count)[0];
        if (betterAlt) target = betterAlt.constraint;
        // else: genuinely nothing else to relax — allow dropping dressStyle as a last resort.
      }
    }

    if (relaxingColor) {
      colorMode = colorMode === 'exact' && specified.has('colorFamily') ? 'family' : 'none';
      relaxedFields.push(colorMode === 'family' ? 'exact color → showing color family' : 'color');
    } else if (target) {
      dropped.add(target);
      relaxedFields.push(target);
    } else {
      // couldn't map the LLM's choice — drop the least-important remaining one
      const fallback = RELAXABLE.find((c) => specified.has(c) && !dropped.has(c));
      if (fallback) { dropped.add(fallback); relaxedFields.push(fallback); }
      else if (colorMode !== 'none') { colorMode = 'none'; relaxedFields.push('color'); }
      else break;
    }
  }

  // Rounds exhausted — return whatever the current filters yield (best effort).
  const pool = await fetchHealedPool(intent, dropped, colorMode);
  return { products: pool, relaxedFields, trace, relaxationMessage: buildRelaxationMessage(intent, relaxedFields), budgetBlock: null };
}

async function fetchCandidatesDeterministic(intent) {
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

  // Return the TIGHTEST level that already has enough results, rather than the
  // largest pool. Because 'color' relaxes LAST, this keeps the user's colour (and
  // other constraints) as long as possible — no more returning teal for a black
  // query just to pad the count.
  const MIN_RESULTS = 8;
  let bestProducts = [];
  let relaxationMessage = null;
  let relaxedFields = [];
  let budgetBlock = null;

  for (const level of levels) {
    const query = buildDBQuery(intent, level.dropped, level.colorMode);
    const poolRaw = await ClothingProduct.find(query).select(SELECT_CLOTHING).limit(100).lean();
    const pool = poolRaw.map(formatClothingForApi);

    const relaxedForLevel = [...level.dropped];
    if (level.label === 'colorExact') relaxedForLevel.push('exact color → showing color family');
    else if (level.label === 'color') relaxedForLevel.push('color');

    if (pool.length >= MIN_RESULTS) {          // tightest sufficient level — stop here
      bestProducts = pool;
      relaxedFields = relaxedForLevel;
      break;
    }
    if (pool.length > bestProducts.length) {   // best-effort for very rare queries
      bestProducts = pool;
      relaxedFields = relaxedForLevel;
    }

    // Budget-block check: this constraint set has NOTHING under budget. If the SAME
    // filters DO have matches once the budget ceiling is lifted, the budget is the
    // real blocker — stop relaxing further and tell the user to raise it, rather
    // than dropping the garment constraints they care about.
    if (intent.maxBudget > 0 && pool.length === 0) {
      const noBudgetQuery = buildDBQuery(intent, new Set([...level.dropped, 'budget']), level.colorMode);
      const overBudget = await ClothingProduct.find(noBudgetQuery)
        .select('price').sort({ price: 1 }).limit(1).lean();
      if (overBudget.length) {
        budgetBlock = {
          maxBudget: intent.maxBudget,
          cheapest: overBudget[0].price,
          keptConstraints: [...specified].filter((c) => !relaxedForLevel.includes(c) && c !== 'colorExact' && c !== 'colorFamily'),
          colorKept: level.colorMode !== 'none'
        };
        bestProducts = [];        // honest: no results under budget for these filters
        relaxedFields = relaxedForLevel;
        break;
      }
    }
  }

  relaxationMessage = buildRelaxationMessage(intent, relaxedFields);

  return { products: bestProducts, relaxationMessage, relaxedFields, specified, budgetBlock };
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

// ─── Honest per-item match explanation ───────────────────────────────────────
/**
 * Compares a product against exactly what the user specified and returns an
 * HONEST reason string plus matched/missed lists. This is the source of truth for
 * "why is this shown" — it never claims a colour/attribute the product doesn't have
 * (fixes teal items displayed with a "black" reason).
 */
function describeMatch(product, intent) {
  const matched = [];
  const missed = [];
  const norm = (x) => (x === 'semi-stitched' ? 'stitched' : x);

  const wantExact = intent.colorExact ? String(intent.colorExact) : null;
  const wantFam = intent.colorFamily && intent.colorFamily !== 'Any' ? intent.colorFamily : null;
  if (wantExact || wantFam) {
    const got = product.primaryExactColor || product.primaryColor || 'unknown';
    if (wantExact && got.toLowerCase() === wantExact.toLowerCase()) matched.push(`${got} (exact colour)`);
    else if (wantFam && product.primaryColor === wantFam) matched.push(`${product.primaryColor} colour`);
    else missed.push(`colour is ${got}, not ${wantExact || wantFam}`);
  }
  if (intent.pieces) {
    const pc = product.pieces ?? product.pieceDetails?.totalCount;
    if (pc === intent.pieces) matched.push(`${pc}-piece`);
    else missed.push(`${pc ?? '?'}-piece, not ${intent.pieces}-piece`);
  }
  if (intent.stitching) {
    const st = product.stitching || product.stitchedType;
    if (norm(st) === norm(intent.stitching)) matched.push(intent.stitching);
    else missed.push(`${st || '?'}, not ${intent.stitching}`);
  }
  if (intent.dressStyle) {
    if (product.dressStyle === intent.dressStyle) matched.push(intent.dressStyle);
    else if (product.dressStyle) missed.push(`${product.dressStyle}, not ${intent.dressStyle}`);
  }
  if (intent.print) {
    const pr = product.print || product.pattern;
    if (pr && String(pr).includes(intent.print)) matched.push(`${intent.print} work`);
    else if (pr) missed.push(`${pr}, not ${intent.print}`);
  }
  if (intent.fabric) {
    if (product.fabric && product.fabric.toLowerCase().includes(String(intent.fabric).toLowerCase())) matched.push(product.fabric);
  }
  if (intent.occasion?.length) {
    const want = intent.occasion.map((x) => String(x).toLowerCase());
    const shared = (product.occasion || []).filter((o) => want.includes(String(o).toLowerCase()));
    if (shared.length) matched.push(`${shared.slice(0, 2).join('/')} occasion`);
    else missed.push(`for ${(product.occasion || []).slice(0, 2).join('/') || 'general'} wear, not ${want.join('/')}`);
  }
  if (intent.maxBudget > 0 && typeof product.price === 'number') {
    if (product.price <= intent.maxBudget) matched.push(`within PKR ${intent.maxBudget}`);
    else missed.push(`PKR ${product.price}, over your PKR ${intent.maxBudget}`);
  }

  let text;
  if (missed.length && matched.length) text = `Matches ${matched.join(', ')}; but ${missed.join(', ')}.`;
  else if (missed.length) text = `Closest we have — ${missed.join(', ')}.`;
  else if (matched.length) text = `Matches your request: ${matched.join(', ')}.`;
  else text = 'A general match from our catalog.';
  return { text, matched, missed };
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
  const { products, relaxationMessage, budgetBlock, trace } = await agenticRelax(intent);

  if (!products.length) {
    // The agentic planner's own honest sentence (it saw the real counts / cheapest
    // price), with a plain fallback.
    const message =
      relaxationMessage ||
      (budgetBlock
        ? `No match under PKR ${budgetBlock.maxBudget.toLocaleString()}${budgetBlock.cheapest ? ` — the closest starts at PKR ${budgetBlock.cheapest.toLocaleString()}; raise your budget to see it` : ''}.`
        : "We couldn't find anything matching your request in our catalog.");
    return {
      results: [],
      accessoryOnly: false,
      searchCatalog: 'clothing',
      matchQuality: {
        tier: budgetBlock ? 'over-budget' : 'none',
        message,
        budgetBlock: budgetBlock ? { maxBudget: budgetBlock.maxBudget, cheapest: budgetBlock.cheapest } : null
      },
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
  const { rankings: ranked, catalogNote } = await rankProductsWithAI(presorted, intent);
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

    // Honest reason: the factual match wins whenever an attribute differs, so a
    // relaxed (e.g. teal) item can never be shown with a "black" reason. The AI's
    // stylistic sentence is only used when every specified attribute actually matches.
    const match = describeMatch(dress, intent);
    const matchReason = r.reason && match.missed.length === 0 ? r.reason : match.text;

    results.push({
      product: dress,
      rank: r.rank,
      matchReason,
      matchDetails: { matched: match.matched, missed: match.missed },
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
    refinementTrace: (trace || []).map((t) => ({ action: t.action, constraint: t.constraint || null, note: t.message })),
    catalogNote: catalogNote || null,   // LLM-generated mismatch banner (null = good match)
    catalogExtractionHealth,
    intentEcho: {
      constraintPriority: intent.constraintPriority || [],
      season: intent.season || null,
      searchCatalog: 'clothing'
    },
    accessoryRetrievalPlan: stripAccessoryPlanForClient(accessoryPlan)
  };
}

const MAX_ACCESSORY_ROUNDS = 3;

/**
 * Agentic widen-and-retry loop for shoe picks. Round 1 hands the AI a modest,
 * heuristically pre-filtered pool (footwearFashionScore — color harmony +
 * contrast + occasion + silhouette-appropriateness, so sneakers are already
 * deprioritized against eastern wear) WITH full description text, not just
 * structured fields. If the AI judges that pool genuinely insufficient
 * (sufficientMatch: false, or it couldn't fill the requested count), the pool
 * is widened to draw from more of the catalog and the AI is asked again — up
 * to MAX_ACCESSORY_ROUNDS — instead of ever settling for the first, possibly-
 * too-narrow batch. Falls back to the deterministic heuristic order/reasons
 * if every AI provider is unavailable.
 */
async function pickShoesWithAgenticLoop(source, shoePool, maxShoes) {
  let candidateCount = Math.max(maxShoes * 3, 15);
  const usedIds = new Set();
  let candidatePicks = [];
  let result = null;

  for (let round = 0; round < MAX_ACCESSORY_ROUNDS; round++) {
    usedIds.clear();
    candidatePicks = [];
    for (let i = 0; i < candidateCount; i++) {
      const pick = pickBestShoe(source, shoePool, usedIds);
      if (!pick) break;
      candidatePicks.push(pick);
    }

    const attempt = await rankShoesWithAI(source, candidatePicks.map((p) => p.product), maxShoes);
    if (!attempt) { result = null; break; } // every AI provider down — fall back to deterministic below
    result = attempt;

    const gotEnough = attempt.picks.length >= Math.min(maxShoes, candidatePicks.length);
    if (attempt.sufficientMatch && gotEnough) break;
    if (candidatePicks.length >= shoePool.length) break; // whole pool already considered
    candidateCount = Math.min(shoePool.length, candidateCount * 2);
  }

  const scoredShoes = result
    ? result.picks.map((ai) => {
        const det = candidatePicks.find((p) => p.product === ai.product);
        return { product: ai.product, scores: { total: det?.score ?? 0.5 }, reason: ai.reason || det?.reason };
      })
    : candidatePicks.slice(0, maxShoes).map((pick) => ({ product: pick.product, scores: { total: pick.score }, reason: pick.reason }));

  return { scoredShoes, result };
}

/** Same widen-and-retry agentic loop as pickShoesWithAgenticLoop, for complementary clothing. */
async function pickComplementaryClothingWithAgenticLoop(source, clothingPool, maxClothing) {
  let candidateCount = Math.max(maxClothing * 3, 15);
  let candidates = [];
  let result = null;

  for (let round = 0; round < MAX_ACCESSORY_ROUNDS; round++) {
    candidates = clothingPool
      .map((c) => ({ product: c, scores: scoreProduct(source, c) }))
      .sort((a, b) => b.scores.total - a.scores.total)
      .slice(0, candidateCount);

    const attempt = await rankComplementaryClothingWithAI(source, candidates.map((c) => c.product), maxClothing);
    if (!attempt) { result = null; break; }
    result = attempt;

    const gotEnough = attempt.picks.length >= Math.min(maxClothing, candidates.length);
    if (attempt.sufficientMatch && gotEnough) break;
    if (candidates.length >= clothingPool.length) break;
    candidateCount = Math.min(clothingPool.length, candidateCount * 2);
  }

  const scoredClothing = result
    ? result.picks.map((ai) => {
        const det = candidates.find((c) => c.product === ai.product);
        return { product: ai.product, scores: det?.scores ?? { total: 0.5 }, reason: ai.reason };
      })
    : candidates.slice(0, maxClothing);

  return { scoredClothing, result };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC: Product-detail-page recommendations
// ═══════════════════════════════════════════════════════════════════════════════
export async function getRecommendations(productId, options = {}) {
  const { maxShoes = 6, maxClothing = 6 } = options;
  const srcRaw = await ClothingProduct.findById(productId).lean();
  if (!srcRaw) {
    // Not a clothing product — it may be a shoe/jewelry/watch card from cross-catalog
    // search. We don't yet cross-match those against clothing, so degrade gracefully
    // (empty "Complete the Look") instead of 404ing the whole product-detail page.
    const isAccessory = await Promise.all([
      ShoeProduct.exists({ _id: productId }),
      JewelryProduct.exists({ _id: productId }),
      WatchProduct.exists({ _id: productId })
    ]);
    if (isAccessory.some(Boolean)) {
      return { source: null, shoes: [], complementaryClothing: [], generatedAt: new Date() };
    }
    throw new Error('Product not found');
  }
  const source = formatClothingForApi(srcRaw);

  const baseQuery = { _id: { $ne: source._id }, inStock: { $ne: false } };

  const pools = await fetchAccessoryPools({ gender: source.gender, maxBudget: 0 });
  const shoePool = pools.shoes;

  const clothingPoolRaw = await ClothingProduct.find(baseQuery).limit(100).lean();
  const clothingPool = clothingPoolRaw.map(formatClothingForApi);

  const [shoeOutcome, clothingOutcome] = await Promise.all([
    pickShoesWithAgenticLoop(source, shoePool, maxShoes),
    pickComplementaryClothingWithAgenticLoop(source, clothingPool, maxClothing)
  ]);
  const { scoredShoes, result: shoeResult } = shoeOutcome;
  const { scoredClothing, result: clothingResult } = clothingOutcome;

  return {
    source,
    shoes: scoredShoes,
    complementaryClothing: scoredClothing,
    shoesNote: shoeResult?.sufficientMatch === false ? shoeResult.note : null,
    complementaryNote: clothingResult?.sufficientMatch === false ? clothingResult.note : null,
    generatedAt: new Date()
  };
}

export { scoreProductAgainstIntent, textualMatchScore } from './intentScoring.js';
