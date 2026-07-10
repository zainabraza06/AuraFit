/**
 * Query understanding for semantic + facet hybrid search.
 * Short queries (e.g. color + occasion) get structured lines so embeddings align
 * with labeled product text from buildClothingEmbeddingText.
 */
import { inferColors } from '../scripts/scrapers/utils/colorInference.js';
import { normalizeColor } from './colorNormalize.js';

/** Same semantics as productParser OCCASION_MAP (subset for search). */
const QUERY_OCCASION_MAP = [
  { kw: ['wedding', 'bridal', 'nikah', 'barat', 'valima', 'shaadi', 'nikkah', 'walima'], val: 'wedding' },
  { kw: ['eid', 'eid collection', 'eid wear', 'eid-wear', 'eidwear'], val: 'eid' },
  { kw: ['festive', 'celebration', 'festive wear'], val: 'eid' },
  { kw: ['luxury', 'couture', 'occasion wear', 'evening wear', 'party wear'], val: 'party' },
  { kw: ['party', 'evening', 'cocktail', 'reception', 'gala'], val: 'party' },
  { kw: ['formal', 'semi-formal', 'semi formal', 'black tie', 'gala dinner'], val: 'formal' },
  { kw: ['office', 'work', 'professional', 'corporate', '9to5', '9 to 5', 'office wear'], val: 'office' },
  { kw: ['casual', 'everyday', 'daily wear', 'daily', 'lounge', 'basics', 'essentials', 'simple'], val: 'casual' },
  { kw: ['mehndi', 'haldi', 'mayun'], val: 'mehndi' },
  { kw: ['lawn', 'summer', 'pret'], val: 'casual' },
  { kw: ['winter', 'khaddar', 'karandi'], val: 'casual' }
];

const QUERY_GARMENT_MAP = [
  { kw: ['saree', 'sari'], val: 'saree' },
  { kw: ['lehenga', 'lehnga'], val: 'lehenga' },
  // sharara/gharara are wide-leg TROUSER styles worn under a kurta/kameez top —
  // a structurally different silhouette from a lehenga's single continuous
  // flared skirt (see imageSearchController.js's vision prompt for the same
  // distinction). Mapping them to 'lehenga' here was wrong and independent of
  // whatever the vision model actually classified the photo as — a kurta over
  // sharara/gharara/palazzo trousers was getting silently overridden to
  // "lehenga" by this keyword map alone, regardless of AI accuracy upstream.
  { kw: ['kurta', 'kurti', 'kameez', 'shalwar', 'salwar', 'sharara', 'gharara'], val: 'kurta' },
  { kw: ['palazzo'], val: 'palazzo' },
  { kw: ['abaya'], val: 'abaya' },
  { kw: ['maxi', 'gown', 'frock'], val: 'frock' },
  { kw: ['sherwani'], val: 'sherwani' },
  { kw: ['polo'], val: 'polo' },
  { kw: ['t-shirt', 't shirt', 'tee'], val: 't-shirt' },
  // Bare "shirt"/"trouser"/"pants" aren't included here — this catalog also
  // describes a shalwar-kameez suit's own pieces as "shirt"+"trouser" (see
  // pieceDetails.includes), so those words alone are NOT a reliable Western
  // signal. Only match genuinely Western-specific terms, or "western"
  // explicitly qualifying the outfit.
  { kw: ['western wear', 'western', 'jeans', 'denim', 'hoodie', 'pantsuit', 'blazer', 'jumpsuit', 'playsuit'], val: 'western' },
  { kw: ['co-ord', 'coord', 'co ord'], val: 'co-ord' }
];

function inferGenderHint(lower) {
  if (/\b(kids|children|child|junior|toddler|baby)\b/.test(lower)) return 'kids';
  if (/\bunisex\b/.test(lower)) return 'unisex';
  if (/\b(women|womens|ladies|female|girls?)\b/.test(lower)) return 'women';
  if (/\b(men|mens|gents|male|boys?)\b/.test(lower)) return 'men';
  return null;
}

function inferFromMap(lower, map) {
  const found = [];
  for (const { kw, val } of map) {
    if (kw.some((k) => lower.includes(k))) found.push(val);
  }
  return [...new Set(found)];
}

/**
 * @param {string} raw
 * @returns {{
 *   raw: string,
 *   lower: string,
 *   colorIntel: ReturnType<typeof inferColors>,
 *   hasExplicitColor: boolean,
 *   occasions: string[],
 *   garmentHints: string[],
 *   genderHint: string | null,
 *   hasStrongConstraints: boolean
 * }}
 */
export function analyzeSearchQuery(raw) {
  const q = String(raw || '').trim();
  const lower = q.toLowerCase();
  const colorIntel = inferColors(q);
  const hasExplicitColor = colorIntel.primaryExactColor !== 'multicolor';
  const occasions = inferFromMap(lower, QUERY_OCCASION_MAP);
  const garmentHints = inferFromMap(lower, QUERY_GARMENT_MAP);
  const genderHint = inferGenderHint(lower);
  const hasStrongConstraints = hasExplicitColor && occasions.length > 0;
  return {
    raw: q,
    lower,
    colorIntel,
    hasExplicitColor,
    occasions,
    garmentHints,
    genderHint,
    hasStrongConstraints
  };
}

/**
 * Text sent to the sentence embedding model for the user query.
 */
export function buildSemanticQueryText(signals) {
  const lines = [signals.raw];
  lines.push('Structured search signals (for matching product catalog):');
  if (signals.occasions.length) {
    lines.push(`Occasion: ${signals.occasions.join(', ')}`);
  }
  if (signals.hasExplicitColor) {
    const fam = [...new Set(signals.colorIntel.colors.filter((c) => c && c !== 'Multicolor'))];
    if (fam.length) lines.push(`Color family: ${fam.join(', ')}`);
    lines.push(`Color keywords: ${signals.colorIntel.exactColors.join(', ')}`);
  }
  if (signals.garmentHints.length) {
    lines.push(`Garment / silhouette: ${signals.garmentHints.join(', ')}`);
  }
  if (signals.genderHint) {
    lines.push(`Gender: ${signals.genderHint}`);
  }
  lines.push('Fashion clothing outfit search.');
  return lines.filter((x) => x && String(x).trim()).join('\n');
}

function canonFamily(c) {
  if (!c) return null;
  return normalizeColor(String(c).trim()) || String(c).trim();
}

/**
 * Facet alignment score in [0, 1] for hybrid ranking (short queries lean on this).
 * @param {ReturnType<typeof analyzeSearchQuery>} signals
 * @param {object} product — lean ClothingProduct fields
 */
export function facetAlignmentScore(signals, product) {
  const hay = [
    product.name,
    product.description,
    product.subCategory,
    product.dressStyle,
    product.category,
    ...(product.tags || []),
    ...(product.style || []),
    ...(product.occasion || []),
    product.primaryColor,
    ...(product.colors || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let occScore = 0.55;
  if (signals.occasions.length && (product.occasion || []).length) {
    const po = (product.occasion || []).map((o) => String(o).toLowerCase());
    const hits = signals.occasions.filter((o) => po.includes(String(o).toLowerCase())).length;
    occScore = hits ? 0.55 + 0.45 * Math.min(1, hits / Math.max(signals.occasions.length, 1)) : 0.12;
  } else if (signals.occasions.length && !(product.occasion || []).length) {
    occScore = 0.35;
  }

  let colScore = 0.55;
  if (signals.hasExplicitColor) {
    const want = new Set(
      signals.colorIntel.colors.map((c) => canonFamily(c)).filter(Boolean)
    );
    const prim = canonFamily(product.primaryColor);
    const plist = (product.colors || []).map((c) => canonFamily(c)).filter(Boolean);
    if (want.has('Multicolor')) {
      colScore = 0.55;
    } else if (prim && want.has(prim)) {
      colScore = 1;
    } else if (plist.some((c) => want.has(c))) {
      colScore = 0.88;
    } else if (prim && [...want].some((w) => w && prim && w !== prim)) {
      colScore = 0.1;
    } else {
      colScore = 0.22;
    }
  }

  let garScore = 0.55;
  if (signals.garmentHints.length) {
    const ds = String(product.dressStyle || '').toLowerCase();
    const sub = String(product.subCategory || '').toLowerCase();
    const nm = String(product.name || '').toLowerCase();
    const ghit = signals.garmentHints.filter((g) => ds.includes(g) || sub.includes(g) || nm.includes(g)).length;
    garScore = ghit ? 0.5 + 0.5 * (ghit / signals.garmentHints.length) : 0.25;
  }

  const qWords = signals.raw
    .toLowerCase()
    .split(/[\s,.-]+/)
    .filter((w) => w.length > 2);
  let kwScore = 0.45;
  if (qWords.length) {
    let hit = 0;
    for (const w of qWords) {
      if (hay.includes(w)) hit++;
    }
    kwScore = 0.35 + 0.65 * (hit / qWords.length);
  }

  return parseFloat(
    (occScore * 0.34 + colScore * 0.34 + garScore * 0.12 + kwScore * 0.2).toFixed(4)
  );
}

/**
 * Weight on dense cosine similarity; rest is facet alignment.
 */
export function semanticBlendWeight(queryLength, hasStrongConstraints) {
  const len = Math.max(0, Number(queryLength) || 0);
  let w = 0.38 + Math.min(1, len / 200) * 0.44;
  if (hasStrongConstraints && len < 48) w -= 0.12;
  return Math.min(0.84, Math.max(0.34, w));
}

export function hybridSearchScore(cosine, facet, queryLength, hasStrongConstraints) {
  const w = semanticBlendWeight(queryLength, hasStrongConstraints);
  return parseFloat((w * cosine + (1 - w) * facet).toFixed(4));
}

export function similarityFloor(signals) {
  if (signals.hasStrongConstraints) return 0.1;
  if (signals.hasExplicitColor || signals.occasions.length) return 0.14;
  return 0.18;
}
