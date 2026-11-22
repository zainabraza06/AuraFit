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

/**
 * Which NON-clothing catalog(s) a query is about, from product-type nouns. Word-boundary matching so
 * "ring" does not fire inside "earring" or "string". Clothing is the default and has no hint.
 */
const CATALOG_NOUNS = {
  jewelry: ['earring', 'earrings', 'jhumka', 'jhumki', 'jhumkay', 'chandbali', 'necklace', 'choker', 'pendant', 'bangle', 'bangles', 'bracelet', 'kada', 'ring', 'rings', 'tikka', 'maang', 'jhoomar', 'nath', 'anklet', 'payal', 'brooch', 'mala', 'jewelry', 'jewellery', 'studs'],
  shoes: ['shoe', 'shoes', 'heel', 'heels', 'sandal', 'sandals', 'khussa', 'khussay', 'kolhapuri', 'sneaker', 'sneakers', 'boot', 'boots', 'loafer', 'loafers', 'flats', 'slipper', 'slippers', 'wedge', 'wedges', 'pump', 'pumps', 'footwear', 'chappal', 'mules'],
  watches: ['watch', 'watches', 'smartwatch', 'wristwatch', 'chronograph']
};

export function inferCatalogHints(lower) {
  const found = [];
  for (const [catalog, nouns] of Object.entries(CATALOG_NOUNS)) {
    let last = -1;
    for (const n of nouns) {
      const re = new RegExp(`(^|[^a-z])${n}(?=$|[^a-z])`, 'g');
      let m;
      while ((m = re.exec(lower))) last = Math.max(last, m.index + m[1].length);
    }
    if (last >= 0) found.push({ catalog, last });
  }
  // "ladies bracelet watch": two catalogs named, but English noun compounds are head-final: the LAST product word
  // ("watch") is what is being asked for and the earlier one ("bracelet") only describes it. A list ("heels and
  // earrings", "shoes, necklace") really wants both, so keep every catalog when the query has a conjunction.
  if (found.length > 1 && !/\b(and|with|plus)\b|[&+,]/.test(lower)) {
    found.sort((a, b) => b.last - a.last);
    return [found[0].catalog];
  }
  return found.map((f) => f.catalog);
}

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
  const catalogHints = inferCatalogHints(lower);
  const hasStrongConstraints = hasExplicitColor && occasions.length > 0;
  return {
    raw: q,
    lower,
    colorIntel,
    hasExplicitColor,
    occasions,
    garmentHints,
    genderHint,
    catalogHints,
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
  // The old text always said "clothing outfit", which pulled jewelry/shoe/watch queries toward clothing.
  const hints = signals.catalogHints || [];
  lines.push(hints.length ? `Fashion ${hints.join(' / ')} product search.` : 'Fashion clothing outfit search.');
  return lines.filter((x) => x && String(x).trim()).join('\n');
}

function canonFamily(c) {
  if (!c) return null;
  return normalizeColor(String(c).trim()) || String(c).trim();
}

/**
 * Everything about a product that facetAlignmentScore needs and that does NOT depend on the query:
 * the lower-cased text blob and canonicalised colours. Computing it once per cached product (instead of once per
 * product per query) removed most of the CPU in warm semantic search (see docs/PLAN.md load test).
 */
export function precomputeFacetData(product) {
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
  return {
    hay,
    prim: canonFamily(product.primaryColor),
    plist: (product.colors || []).map((c) => canonFamily(c)).filter(Boolean),
    po: (product.occasion || []).map((o) => String(o).toLowerCase()),
    ds: String(product.dressStyle || '').toLowerCase(),
    sub: String(product.subCategory || '').toLowerCase(),
    nm: String(product.name || '').toLowerCase()
  };
}

/** Query-side values, computed once per query and kept on the signals object. */
function querySide(signals) {
  if (!signals._qs) {
    signals._qs = {
      want: new Set(signals.colorIntel.colors.map((c) => canonFamily(c)).filter(Boolean)),
      qWords: signals.raw.toLowerCase().split(/[\s,.-]+/).filter((w) => w.length > 2),
      occ: signals.occasions.map((o) => String(o).toLowerCase())
    };
  }
  return signals._qs;
}

/**
 * Facet alignment score in [0, 1] for hybrid ranking (short queries lean on this).
 * @param {ReturnType<typeof analyzeSearchQuery>} signals
 * @param {object} product — lean ClothingProduct fields
 * @param {ReturnType<typeof precomputeFacetData>} [fx] — pass a cached value when scoring many queries against the same product
 */
export function facetAlignmentScore(signals, product, fx = precomputeFacetData(product)) {
  const { want, qWords, occ } = querySide(signals);

  let occScore = 0.55;
  if (occ.length && fx.po.length) {
    const hits = occ.filter((o) => fx.po.includes(o)).length;
    occScore = hits ? 0.55 + 0.45 * Math.min(1, hits / Math.max(occ.length, 1)) : 0.12;
  } else if (occ.length && !fx.po.length) {
    occScore = 0.35;
  }

  let colScore = 0.55;
  if (signals.hasExplicitColor) {
    if (want.has('Multicolor')) {
      colScore = 0.55;
    } else if (fx.prim && want.has(fx.prim)) {
      colScore = 1;
    } else if (fx.plist.some((c) => want.has(c))) {
      colScore = 0.88;
    } else if (fx.prim && [...want].some((w) => w && w !== fx.prim)) {
      colScore = 0.1;
    } else {
      colScore = 0.22;
    }
  }

  let garScore = 0.55;
  if (signals.garmentHints.length) {
    const ghit = signals.garmentHints.filter((g) => fx.ds.includes(g) || fx.sub.includes(g) || fx.nm.includes(g)).length;
    garScore = ghit ? 0.5 + 0.5 * (ghit / signals.garmentHints.length) : 0.25;
  }

  let kwScore = 0.45;
  if (qWords.length) {
    let hit = 0;
    for (const w of qWords) {
      if (fx.hay.includes(w)) hit++;
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
