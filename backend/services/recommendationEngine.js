/**
 * recommendationEngine.js
 * AI outfit recommendation scoring system — semantic-first, rule-assisted.
 *
 * Score formulas:
 *   Product-vs-Product: embeddingSimilarity×0.5 + color×0.2 + occasion×0.2 + style×0.1
 *
 *   Intent-vs-Product (dynamic, normalised weights):
 *     semantic(45)* + color(55) + style(14) + piece(10)* + fabric(4)* + stitching(4)* + occasion(4) + price(8)*
 *     (* only active when the factor is applicable / available)
 *
 *   Semantic score uses cosine similarity between the query embedding and the product
 *   embedding. Falls back to keyword overlap of intentSummary vs product text when
 *   no embeddings exist, so any input language/format works.
 *
 *   Price is scored softly — within-budget = 1.0, over-budget decays toward 0.
 */

import Product from '../models/Product.js';
import { getColorArrayCompatibility } from './colorTheory.js';
import { getTextEmbedding } from './huggingface.js';

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

// ─── subCategory match (piece intent) ────────────────────────────────────────
// Returns null when piece is not in the query (factor is skipped from scoring).
function getSubCategoryScore(product, pieceIntent) {
  if (!pieceIntent) return null;
  const sub   = (product.subCategory || '').toLowerCase();
  const piece = pieceIntent.toLowerCase().trim();
  if (!sub) return 0.3;

  // Exact or dash-normalised match ("2-piece" === "2 piece")
  if (sub === piece || sub.replace(/-/g, ' ') === piece.replace(/-/g, ' ')) return 1.0;

  // Unstitched intent — only unstitched sub-categories match well
  if (piece.includes('unstitched')) {
    return sub.startsWith('unstitched') ? 1.0 : 0.15;
  }

  // Shalwar kameez family — "shalwar kameez", "shalwar kamez", "suit", "kameez", "salwar"
  const suitTerms = ['shalwar kameez', 'shalwar kamez', 'salwar kameez', 'suit', 'kameez', 'salwar'];
  if (suitTerms.some((t) => piece.includes(t))) {
    if (['2-piece', '3-piece', 'kurta', 'shalwar'].includes(sub)) return 0.9;
    if (sub.includes('piece')) return 0.7;
    if (sub.startsWith('unstitched')) return 0.4;
  }

  // Kurta intent
  if (piece === 'kurta') {
    if (sub === 'kurta') return 1.0;
    if (sub.includes('piece')) return 0.5;
  }

  // 2-piece / 3-piece explicit
  if (piece.includes('2') && piece.includes('piece')) {
    if (sub === '2-piece') return 1.0;
    if (sub === 'unstitched-2-piece') return 0.6;
    if (sub === '3-piece') return 0.5;
    if (sub === 'kurta') return 0.4;
  }
  if (piece.includes('3') && piece.includes('piece')) {
    if (sub === '3-piece') return 1.0;
    if (sub === 'unstitched-3-piece') return 0.6;
    if (sub === '2-piece') return 0.5;
    if (sub === 'kurta') return 0.4;
  }

  return 0.2;
}

// ─── Fabric match ─────────────────────────────────────────────────────────────
// Returns null when fabric is not mentioned in the query.
function getFabricScore(product, fabricIntent) {
  if (!fabricIntent) return null;
  const productFabric = (product.fabric || product.type || '').toLowerCase();
  const fabric = fabricIntent.toLowerCase().trim();
  if (!productFabric) return 0.3;
  if (productFabric.includes(fabric) || fabric.includes(productFabric)) return 1.0;
  return 0.2;
}

// ─── Stitching match ──────────────────────────────────────────────────────────
// Returns null when stitching preference was not stated.
function getStitchingScore(product, stitchingIntent) {
  if (!stitchingIntent) return null;
  const sub         = (product.subCategory || '').toLowerCase();
  const isUnstitched = sub.startsWith('unstitched');
  if (stitchingIntent === 'stitched')   return isUnstitched ? 0.1 : 1.0;
  if (stitchingIntent === 'unstitched') return isUnstitched ? 1.0 : 0.1;
  return 0.5;
}

// ─── Textual match score (fallback when no embeddings) ───────────────────────
// Scores how well a product's full text (name + description + tags) matches
// the user's intentSummary. Works for any language/format since it's just
// substring overlap — the real semantic lift comes from embeddings when available.
function textualMatchScore(product, intentSummary) {
  if (!intentSummary) return 0.3;
  const queryWords = intentSummary.toLowerCase().split(/[\s,.\-/]+/).filter((w) => w.length > 2);
  if (!queryWords.length) return 0.3;
  const productText = [
    product.name || '', product.description || '', product.brand || '',
    product.subCategory || '', ...(product.tags || []), ...(product.style || []),
    ...(product.occasion || []), product.fabric || ''
  ].join(' ').toLowerCase();
  const matches = queryWords.filter((w) => productText.includes(w)).length;
  return Math.min(0.95, 0.1 + matches / queryWords.length);
}

// ─── Score a product against a user intent ────────────────────────────────────
// Semantic-first: uses embedding cosine similarity when available; falls back to
// textual overlap so ANY input format (Urdu, prose, mixed) works correctly.
//
// Active factors and base weights (normalised to 1.0):
//   semantic(45)*  — cosine sim between query embedding and product embedding
//   color(55)      — five-tier exact→alias→canonical→wrong-family
//   style(14)      — set overlap
//   piece(10)*     — sub-category match
//   fabric(4)*     — fabric string match
//   stitching(4)*  — stitched vs unstitched
//   occasion(4)    — set overlap
//   price(8)*      — soft budget score (within-budget = 1.0, decays over budget)
//   (* only active when applicable)
function scoreProductAgainstIntent(product, intent, queryEmbedding = null) {
  const {
    color, shade,
    occasion = [], style = [],
    fabric = null, piece = null, stitching = null,
    maxBudget = 0, intentSummary = ''
  } = intent;

  // ── Color (five-tier) ──────────────────────────────────────────────────────
  let colorScore = 0.4;
  const colorSpecified = color && color.toLowerCase() !== 'any';

  if (colorSpecified) {
    const shadeToMatch = (shade || color).toLowerCase();

    // Tier 1 & 2 — exact scraped shade match (new exactColors / primaryExactColor fields)
    const primaryExact   = (product.primaryExactColor || '').toLowerCase();
    const secondaryExact = (product.exactColors || [])
      .filter((c) => c && c.toLowerCase() !== primaryExact)
      .map((c) => c.toLowerCase());

    const primaryExactMatch   = primaryExact && (primaryExact.includes(shadeToMatch) || shadeToMatch.includes(primaryExact));
    const secondaryExactMatch = secondaryExact.some((c) => c.includes(shadeToMatch) || shadeToMatch.includes(c));

    // Tier 3 & 4 — canonical family match (original colors / primaryColor fields, unchanged)
    const targetFamily      = normalizeColor(color);
    const primaryFamily     = product.primaryColor || '';   // already canonical
    const secondaryFamilies = (product.colors || []).filter((c) => c !== primaryFamily);

    const primaryFamilyMatch   = primaryFamily === targetFamily;
    const secondaryFamilyMatch = secondaryFamilies.includes(targetFamily);

    if      (primaryExactMatch)    colorScore = 1.0;
    else if (secondaryExactMatch)  colorScore = 0.93;
    else if (primaryFamilyMatch)   colorScore = 0.85;
    else if (secondaryFamilyMatch) colorScore = 0.78;
    else                           colorScore = 0.08;
  }

  // ── Style & occasion ───────────────────────────────────────────────────────
  const styleScore   = setOverlapScore(style,   product.style   || []);
  const occasionScore = setOverlapScore(occasion, product.occasion || []);

  // ── Piece / fabric / stitching ────────────────────────────────────────────
  const pieceScoreVal      = getSubCategoryScore(product, piece);
  const fabricScoreVal     = getFabricScore(product, fabric);
  const stitchingScoreVal  = getStitchingScore(product, stitching);

  // ── Semantic score ─────────────────────────────────────────────────────────
  // Use embedding cosine similarity when both query and product embeddings exist.
  // Fall back to textual overlap (works for any input language/format).
  let semanticScore = null;
  if (queryEmbedding?.length && product.embedding?.length) {
    semanticScore = cosineSimilarity(queryEmbedding, product.embedding);
  } else if (intentSummary) {
    semanticScore = textualMatchScore(product, intentSummary);
  }

  // ── Price score (soft — within-budget = 1.0, decays as price exceeds budget) ─
  let priceScore = null;
  if (maxBudget > 0 && product.price > 0) {
    if (product.price <= maxBudget) {
      priceScore = 1.0;
    } else {
      const overRatio = (product.price - maxBudget) / maxBudget;
      priceScore = Math.max(0, 1.0 - overRatio * 2);
    }
  }

  // ── Dynamic normalised weighting ──────────────────────────────────────────
  const factors = [
    { score: colorScore,        weight: 55, active: true },
    { score: styleScore,        weight: 14, active: true },
    { score: pieceScoreVal,     weight: 10, active: pieceScoreVal     !== null },
    { score: fabricScoreVal,    weight:  4, active: fabricScoreVal    !== null },
    { score: stitchingScoreVal, weight:  4, active: stitchingScoreVal !== null },
    { score: occasionScore,     weight:  4, active: true },
    { score: semanticScore,     weight: 45, active: semanticScore     !== null },
    { score: priceScore,        weight:  8, active: priceScore        !== null }
  ];

  const active     = factors.filter((f) => f.active);
  const totalW     = active.reduce((s, f) => s + f.weight, 0);
  const finalScore = active.reduce((s, f) => s + f.score * (f.weight / totalW), 0);

  return {
    total:          parseFloat(finalScore.toFixed(3)),
    colorMatch:     parseFloat(colorScore.toFixed(3)),
    semanticMatch:  semanticScore !== null ? parseFloat(semanticScore.toFixed(3)) : null,
    priceMatch:     priceScore    !== null ? parseFloat(priceScore.toFixed(3))    : null,
    styleMatch:     parseFloat(styleScore.toFixed(3)),
    occasionMatch:  parseFloat(occasionScore.toFixed(3)),
    pieceMatch:     pieceScoreVal     !== null ? parseFloat(pieceScoreVal.toFixed(3))     : null,
    fabricMatch:    fabricScoreVal    !== null ? parseFloat(fabricScoreVal.toFixed(3))    : null,
    stitchingMatch: stitchingScoreVal !== null ? parseFloat(stitchingScoreVal.toFixed(3)) : null
  };
}

// ─── Shoe match reason ────────────────────────────────────────────────────────
// Generates a human-readable string explaining why a shoe pairs with a dress.
function generateShoeMatchReason(shoe, heroDress) {
  const parts = [];

  const shoeColor  = normalizeColor(shoe.primaryColor  || '') || shoe.primaryColor  || 'Neutral';
  const dressColor = normalizeColor(heroDress.primaryColor || '') || heroDress.primaryColor || 'this outfit';

  const neutralDescriptions = {
    Black:  'versatile black goes with everything',
    White:  'crisp white creates a fresh contrast',
    Brown:  'warm brown earthy complement',
    Beige:  'neutral beige ties the look together',
    Grey:   'cool grey adds sophisticated balance',
    Gold:   'metallic gold elevates the ensemble'
  };

  if (shoeColor === dressColor) {
    parts.push(`tonal ${shoeColor} match for a cohesive look`);
  } else if (neutralDescriptions[shoeColor]) {
    parts.push(neutralDescriptions[shoeColor]);
  } else {
    parts.push(`${shoeColor} pairs with ${dressColor}`);
  }

  // Shared occasions
  const dressOccasions = (heroDress.occasion || []).map((o) => o.toLowerCase());
  const sharedOccasions = (shoe.occasion || []).filter((o) => dressOccasions.includes(o.toLowerCase()));
  if (sharedOccasions.length > 0) {
    parts.push(`both ${sharedOccasions.slice(0, 2).join(' & ')} appropriate`);
  }

  // Shared style
  const dressStyles  = (heroDress.style || []).map((s) => s.toLowerCase());
  const sharedStyles = (shoe.style || []).filter((s) => dressStyles.includes(s.toLowerCase()));
  if (sharedStyles.length > 0) {
    parts.push(`${sharedStyles[0]} style alignment`);
  }

  return parts.join(' · ') || `complements the ${dressColor} outfit`;
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
// Color filtering rules:
//   - If color is specified and correct-color products exist → exclude wrong-color (score=0.08) products
//   - If color is specified but NO correct-color products exist → return colorMessage, empty results
//   - If no exact shade found but alias/canonical match found → return informational colorMessage
// Occasions that have no dedicated product tag — map to DB-available equivalents
const OCCASION_FALLBACKS = {
  mehndi:  ['party', 'eid', 'festive'],
  barat:   ['wedding', 'party'],
  valima:  ['wedding', 'party'],
  formal:  ['office', 'party'],
};

export async function getOutfitForQuery(intent) {
  const { maxBudget = 0, color, shade, occasion = [], gender, intentSummary, originalMessage } = intent;

  // ── Generate query embedding (semantic matching for any input) ───────────
  let queryEmbedding = null;
  const queryText = intentSummary || originalMessage || '';
  if (queryText && process.env.HUGGING_FACE_API_KEY) {
    try {
      const raw = await getTextEmbedding(queryText);
      if (raw?.length) queryEmbedding = Array.isArray(raw[0]) ? raw[0] : raw;
    } catch (e) {
      console.warn('[Outfit] Query embedding failed (scoring falls back to text):', e.message);
    }
  }

  // ── Build DB query — minimal hard filters only ────────────────────────────
  const clothingQuery = { category: 'clothing' };
  // Soft budget: load up to 20% over budget; price scoring handles the rest
  if (maxBudget > 0) clothingQuery.price = { $lte: maxBudget * 1.2 };
  // Only hard-filter for men/kids — 'unisex' and 'women' use the full product pool
  if (gender && gender !== 'women' && gender !== 'unisex') clothingQuery.gender = gender;

  const { stitching } = intent;
  let stitchingFallbackMessage = null;

  if (stitching === 'stitched') {
    clothingQuery.subCategory = { $not: /^unstitched/i };
  }

  const selectFields = 'name brand category subCategory pieces fabric type price primaryColor colors primaryExactColor exactColors occasion style tags imageUrl images productUrl description gender embedding';

  let clothingPool = [];

  if (stitching === 'unstitched') {
    // Try unstitched first; if none found, fall back to full pool with a message
    clothingPool = await Product.find({ ...clothingQuery, subCategory: { $regex: /^unstitched/i } })
      .select(selectFields)
      .limit(400)
      .lean();

    if (clothingPool.length === 0) {
      stitchingFallbackMessage = 'No unstitched options found. Showing available stitched products instead.';
      clothingPool = await Product.find(clothingQuery)
        .select(selectFields)
        .limit(400)
        .lean();
    }
  } else {
    clothingPool = await Product.find(clothingQuery)
      .select(selectFields)
      .limit(400)
      .lean();
  }

  if (clothingPool.length === 0) {
    return {
      heroDress: null, otherDresses: [], shoes: [], scores: [],
      matchQuality: { tier: 'none', pct: 0, message: "This combination isn't available in our catalog right now. Here are a few products you might like." },
      colorMessage: null
    };
  }

  // Score every clothing product against the parsed intent + query embedding
  const scored = clothingPool
    .map((product) => ({ product, scores: scoreProductAgainstIntent(product, intent, queryEmbedding) }))
    .sort((a, b) => b.scores.total - a.scores.total);

  // ── Color filtering ────────────────────────────────────────────────────────
  let colorMessage = null;
  let finalScored = scored;
  const colorSpecified = color && color.toLowerCase() !== 'any';

  if (colorSpecified) {
    const shadeToFind = shade || color.toLowerCase();

    // Tier 1: exact shade match (colorMatch ≥ 0.9 means primaryColor or secondary exact match)
    const exactMatches = scored.filter((s) => s.scores.colorMatch >= 0.9);

    if (exactMatches.length > 0) {
      // Exact shade found — show them, no message needed
      finalScored = exactMatches;
    } else {
      // Tier 2: canonical family match (colorMatch 0.09–0.89 means family match)
      const familyMatches = scored.filter((s) => s.scores.colorMatch > 0.08);

      if (familyMatches.length > 0) {
        // No exact shade but same color family exists — show family with message listing actual shades
        const actualShades = [...new Set(
          familyMatches.slice(0, 10).map((s) => s.product.primaryExactColor || s.product.primaryColor).filter(Boolean)
        )].slice(0, 5).join(', ');
        colorMessage = `No exact "${shadeToFind}" products found. Showing ${color} family products — available shades: ${actualShades}.`;
        finalScored = familyMatches;
      } else {
        // No color match at all — show best overall matches
        colorMessage = `No ${shadeToFind} products found in our catalog. Showing best available matches instead.`;
        finalScored = scored;
      }
    }
  }

  // ── Piece-count fallback: relax piece if top results don't satisfy it ──────
  const intendedPieces = intent.pieces;
  let pieceFallbackMessage = null;
  if (intendedPieces) {
    const top20 = finalScored.slice(0, 20);
    const hasExactPiece = top20.some((d) => d.product.pieces === intendedPieces);
    if (!hasExactPiece) {
      // Check for adjacent piece count (3→2, 2→3, etc.)
      const adjacent = intendedPieces === 3 ? 2 : 3;
      const hasAdjacent = top20.some((d) => d.product.pieces === adjacent);
      if (hasAdjacent) {
        pieceFallbackMessage = `No ${intendedPieces}-piece options found for this style. Showing ${adjacent}-piece and similar sets instead.`;
      } else {
        pieceFallbackMessage = `No ${intendedPieces}-piece options found. Showing closest available styles.`;
      }
    }
  }

  const top10 = finalScored.slice(0, 10);
  const heroDress = top10[0]?.product || null;

  // ── Occasion fallback message ─────────────────────────────────────────────
  // When user asked for mehndi/barat/valima but products are tagged differently,
  // detect this and add an informational message rather than returning nothing.
  let occasionFallbackMessage = null;
  if (top10.length > 0 && occasion.length > 0) {
    const primaryOccasion = occasion[0];
    const fallbackOccasions = OCCASION_FALLBACKS[primaryOccasion];
    if (fallbackOccasions) {
      const hasDirectMatch = top10.some((d) =>
        (d.product.occasion || []).some((o) => occasion.includes(o))
      );
      if (!hasDirectMatch) {
        const label = primaryOccasion.charAt(0).toUpperCase() + primaryOccasion.slice(1);
        const altLabel = fallbackOccasions.slice(0, 2).join(' & ');
        occasionFallbackMessage = `No ${label}-specific collections found. Showing ${altLabel} wear that works perfectly for ${label} functions.`;
      }
    }
  }

  // ── Universal match quality tier ─────────────────────────────────────────
  // Tells the frontend exactly how well the results satisfy the query.
  // Penalty approach: start from the top product's raw score, deduct for each
  // constraint that fell back, then map the effective score to a tier label.
  const topScore = top10[0]?.scores.total ?? 0;
  const topColorMatch = top10[0]?.scores.colorMatch ?? 0;

  // Was color truly unavailable (showing wrong-color products as last resort)?
  const colorTrulyMissing = colorMessage !== null && topColorMatch <= 0.08;
  // Shade alias used (e.g. maroon→Red, ferozi→Teal) — family is correct
  const colorAliasUsed = colorMessage !== null && !colorTrulyMissing;

  const penalty =
    (colorTrulyMissing     ? 0.20 : 0) +
    (colorAliasUsed        ? 0.05 : 0) +
    (occasionFallbackMessage ? 0.07 : 0) +
    (pieceFallbackMessage    ? 0.04 : 0);

  const effectiveScore = topScore - penalty;

  let matchQuality;
  if (top10.length === 0) {
    matchQuality = {
      tier: 'none', pct: 0,
      message: "This combination isn't available in our catalog right now. Here are a few products you might like."
    };
  } else if (effectiveScore >= 0.60) {
    matchQuality = { tier: 'exact', pct: 100, message: null };
  } else if (effectiveScore >= 0.48) {
    matchQuality = {
      tier: 'close', pct: 90,
      message: 'Showing very close matches — almost exactly what you described.'
    };
  } else if (effectiveScore >= 0.35) {
    matchQuality = {
      tier: 'similar', pct: 80,
      message: 'No exact match found. Showing the most similar products we have.'
    };
  } else if (effectiveScore >= 0.20) {
    matchQuality = {
      tier: 'loose', pct: 50,
      message: 'No close match available. Showing loosely related products you might like.'
    };
  } else {
    matchQuality = {
      tier: 'none', pct: 0,
      message: "This specific combination doesn't exist in our catalog. Here are a few products you might like."
    };
  }

  // Best-matching shoes for the hero dress
  let shoes = [];
  if (heroDress) {
    const shoePool = await Product.find({ category: 'shoes' })
      .select('name brand category subCategory price primaryColor colors occasion style tags imageUrl images productUrl')
      .limit(150)
      .lean();

    shoes = shoePool
      .map((s) => {
        const shoeScores = scoreProduct(heroDress, s);
        return { ...s, _score: shoeScores.total, matchReason: generateShoeMatchReason(s, heroDress) };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
  }

  return {
    heroDress,
    otherDresses: top10.slice(1).map((d) => d.product),
    shoes,
    scores: top10.map((d) => ({ productId: d.product._id, ...d.scores })),
    matchQuality,
    colorMessage,
    ...(occasionFallbackMessage  ? { occasionFallbackMessage }  : {}),
    ...(pieceFallbackMessage     ? { pieceFallbackMessage }     : {}),
    ...(stitchingFallbackMessage ? { stitchingFallbackMessage } : {})
  };
}

// ─── Exported test helpers ────────────────────────────────────────────────────
export { scoreProductAgainstIntent, textualMatchScore, normalizeColor };
