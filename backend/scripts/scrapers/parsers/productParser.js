/**
 * productParser.js  — ClothingProduct normalizer
 * Converts raw Shopify/HTML extracted data into the full ClothingProduct schema.
 * Fields that cannot be inferred are left undefined so the AI enricher can fill them.
 */

import { inferColors } from '../utils/colorInference.js';

// ─── Required fields ──────────────────────────────────────────────────────────
const REQUIRED_FIELDS = ['name', 'price', 'productUrl', 'images'];

// ─── Occasion map ─────────────────────────────────────────────────────────────
const OCCASION_MAP = [
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

// ─── Style adjective map ──────────────────────────────────────────────────────
const STYLE_MAP = [
  { kw: ['embroidered','embellished','zardozi','gota','tilla','stone work','chikankari'], val: 'embroidered' },
  { kw: ['printed','digital print','screen print'], val: 'printed' },
  { kw: ['minimal','solid','plain','basic'], val: 'minimal' },
  { kw: ['trendy','contemporary','modern'], val: 'trendy' },
  { kw: ['elegant','luxury','luxe','premium','couture'], val: 'elegant' },
  { kw: ['traditional','cultural','ethnic','desi'], val: 'traditional' },
  { kw: ['western','jeans','denim','hoodie'], val: 'western' },
  { kw: ['heavy','bridal','handwork','sequin'], val: 'heavy' }
];

// ─── Dress style (silhouette) map ─────────────────────────────────────────────
const DRESS_STYLE_MAP = [
  { kw: ['saree','sari'], val: 'saree' },
  { kw: ['lehenga','lehnga','lehenga choli','sharara','gharara'], val: 'lehenga' },
  { kw: ['frock','shirt frock','a-line frock'], val: 'frock' },
  { kw: ['maxi dress', 'maxi frock', 'maxi gown'], val: 'frock' },
  { kw: ['floor length gown', 'evening gown', 'gown'], val: 'gown' },
  { kw: ['maxi'], val: 'maxi' },
  { kw: ['abaya'], val: 'abaya' },
  { kw: ['co-ord','coord set','coordinate set','matching set'], val: 'co-ord' },
  { kw: ['palazzo'], val: 'palazzo' },
  { kw: ['pant coat','pant-coat','coat pant','3 piece suit western','suit formal'], val: 'pant-coat' },
  { kw: ['sherwani'], val: 'sherwani' },
  { kw: ['shalwar kameez','salwar kameez','shalwar kamiz'], val: 'shalwar-kameez' },
  { kw: ['kurta set', 'kurta', 'kurti', 'kameez'], val: 'kurta' },
  { kw: ['t-shirt', 't shirt', 'tee shirt', 'tees', 'graphic tee'], val: 't-shirt' },
  { kw: ['polo shirt', 'polo tee', 'polo'], val: 'polo' },
  { kw: ['dress shirt', 'button down', 'button-down', 'casual shirt', 'formal shirt', 'oxford shirt'], val: 'shirt' },
  { kw: ['tunic'], val: 'tunic' },
  { kw: ['western wear','jeans','denim','hoodie','sweatshirt'], val: 'western' }
];

// ─── Pattern map ──────────────────────────────────────────────────────────────
const PATTERN_MAP = [
  { kw: ['embroidered','embellished','zardozi','tilla','gota','handwork','chikankari','cutwork','thread work'], val: 'embroidered' },
  { kw: ['floral print','floral'], val: 'floral' },
  { kw: ['geometric','checks','stripes','stripe','checkered','tartan'], val: 'geometric' },
  { kw: ['digital print','screen print','block print','resist print'], val: 'digital-print' },
  { kw: ['printed'], val: 'printed' },
  { kw: ['textured','jacquard','brocade'], val: 'textured' },
  { kw: ['sequin','stone work','mirror work','embellished'], val: 'embellished' },
  { kw: ['plain','solid','self','minimal','basic'], val: 'plain' }
];

// ─── Fashion type map ─────────────────────────────────────────────────────────
const FASHION_TYPE_MAP = [
  { kw: ['western wear','jeans','denim','t-shirt','tshirt','hoodie','sweatshirt','co-ord','jogger','blazer','jumpsuit'], val: 'western' },
  { kw: ['fusion','indo-western','indo western','boho'], val: 'fusion' }
];

// ─── Season map ───────────────────────────────────────────────────────────────
const SEASON_MAP = [
  { kw: ['summer','lawn','cotton','voile','chiffon','georgette'], val: 'summer' },
  { kw: ['winter','khaddar','karandi','linen','wool','velvet','fleece','tweed'], val: 'winter' }
];

// ─── Gender map ───────────────────────────────────────────────────────────────
const GENDER_MAP = [
  { kw: ['men','gents','male','kurta pajama for men','boys shirt'], val: 'men' },
  { kw: ['kids','children','child','junior','toddler','baby girl','baby boy'], val: 'kids' },
  { kw: ['unisex','gender neutral'], val: 'unisex' }
];

// ─── Trend tag map ────────────────────────────────────────────────────────────
const TREND_TAG_MAP = [
  { kw: ['minimal','solid','plain','basic','simple'], val: 'minimalist' },
  { kw: ['luxury','couture','premium','haute','luxe','signature'], val: 'luxury' },
  { kw: ['festive','eid','wedding','bridal','mehndi','celebration'], val: 'festive' },
  { kw: ['traditional','ethnic','desi','cultural','khaddar','karandi'], val: 'traditional' },
  { kw: ['modern','contemporary','trendy','western','fusion','co-ord'], val: 'modern' }
];

// ─── Sleeve map ───────────────────────────────────────────────────────────────
const SLEEVE_MAP = [
  { kw: ['sleeveless','without sleeves','no sleeve'], val: 'sleeveless' },
  { kw: ['half sleeve','short sleeve','half-sleeve'], val: 'half-sleeve' },
  { kw: ['three quarter','3/4 sleeve','3/4th sleeve'], val: 'three-quarter' },
  { kw: ['cap sleeve','flutter sleeve'], val: 'cap-sleeve' },
  { kw: ['full sleeve','long sleeve','full-sleeve'], val: 'full-sleeve' }
];

// ─── Neckline map ─────────────────────────────────────────────────────────────
const NECKLINE_MAP = [
  { kw: ['v-neck','v neck','vneck'], val: 'v-neck' },
  { kw: ['boat neck','bateau','boat-neck'], val: 'boat-neck' },
  { kw: ['collar','collared','shirt collar'], val: 'collar' },
  { kw: ['keyhole','cut out neckline'], val: 'keyhole' },
  { kw: ['halter','halter neck'], val: 'halter' },
  { kw: ['square neck','square neckline'], val: 'square' },
  { kw: ['off shoulder','off-shoulder'], val: 'off-shoulder' },
  { kw: ['round neck','round neckline'], val: 'round' }
];

// ─── Fit map ──────────────────────────────────────────────────────────────────
const FIT_MAP = [
  { kw: ['slim fit','fitted','body con','bodycon','pencil'], val: 'slim' },
  { kw: ['loose fit','oversized','relaxed','boxy'], val: 'loose' },
  { kw: ['flared','a-line','a line','bell'], val: 'flared' },
  { kw: ['straight fit','straight cut'], val: 'straight' }
];

// ─── SubCategory keywords ─────────────────────────────────────────────────────
const SUBCATEGORY_KW = {
  '4-piece':            ['4-piece','four piece','4 piece','4pc','4-pc'],
  '3-piece':            ['3-piece','3piece','three-piece','3 piece','3pc','3-pc',
                         'shirt trouser dupatta','shirt & trouser & dupatta'],
  '2-piece':            ['2-piece','2piece','two-piece','2 piece','2pc','2-pc',
                         'shirt & trouser','shirt and trouser','shirt trouser'],
  'kurta':              ['kurti','kameez','1-piece','one piece','1 piece','shirt only','1pc'],
  'pants':              ['trousers only','bottoms only','palazzo only','cigarette pant','pant only'],
  'shalwar':            ['shalwar only','salwar only'],
  'dupatta':            ['dupatta only','stole only','shawl only'],
  'unstitched-3-piece': ['unstitched 3-piece','un-stitched 3 piece','unstitched three piece',
                         'unstitched 3 piece','unstitched 3pc'],
  'unstitched-2-piece': ['unstitched 2-piece','un-stitched 2 piece','unstitched 2 piece','unstitched 2pc'],
  'unstitched-1-piece': ['unstitched 1-piece','unstitched shirt only','unstitched 1 piece'],
  'western':            ['western wear','jeans','denim','hoodie','sweatshirt','t-shirt','tshirt'],
  'co-ord':             ['co-ord','coord set','co ord','coordinated set','matching set','two piece set','2 piece set'],
  'bridal':             ['bridal couture','bridal collection','bridal wear','wedding dress','bride'],
  'festive':            ['wedding wear','luxury formal','heavy embroidered','chikankari formal','festive wear']
};

// ─── Canonical composition per subCategory ─────────────────────────────────
// The collection a product was scraped from is the most reliable signal for its
// garment composition. This table is the single source of truth for stitching,
// piece count, and included pieces. Text is only used to REFINE ambiguous cases
// (see below) — never to override a definite collection label. This prevents the
// classic bugs where a stray "dupatta"/"trouser"/"1 piece" mention in marketing
// copy corrupted a 2-piece / 3-piece item.
//   definitePieces: true  → piece count is fixed by the collection, ignore text
//   stitched: null        → stitching is ambiguous, fall back to text detection
const SUBCATEGORY_CANONICAL = {
  '2-piece':            { pieceType: '2-piece', definitePieces: true,  stitched: 'stitched',   includes: ['shirt', 'trouser'],                dressStyle: 'shalwar-kameez' },
  '3-piece':            { pieceType: '3-piece', definitePieces: true,  stitched: 'stitched',   includes: ['shirt', 'trouser', 'dupatta'],     dressStyle: 'shalwar-kameez' },
  '4-piece':            { pieceType: '4-piece', definitePieces: true,  stitched: 'stitched',   includes: ['shirt', 'trouser', 'dupatta', 'inner'], dressStyle: 'shalwar-kameez' },
  'kurta':              { pieceType: '1-piece', definitePieces: true,  stitched: 'stitched',   includes: ['shirt'],                           dressStyle: 'kurta' },
  'pants':              { pieceType: '1-piece', definitePieces: true,  stitched: 'stitched',   includes: ['trouser'],                         dressStyle: 'trouser' },
  'shalwar':            { pieceType: '1-piece', definitePieces: true,  stitched: 'stitched',   includes: ['shalwar'],                         dressStyle: 'trouser' },
  'dupatta':            { pieceType: '1-piece', definitePieces: true,  stitched: 'stitched',   includes: ['dupatta'],                         dressStyle: 'other' },
  'unstitched-1-piece': { pieceType: '1-piece', definitePieces: true,  stitched: 'unstitched', includes: ['shirt'],                           dressStyle: 'shalwar-kameez' },
  'unstitched-2-piece': { pieceType: '2-piece', definitePieces: true,  stitched: 'unstitched', includes: ['shirt', 'trouser'],                dressStyle: 'shalwar-kameez' },
  'unstitched-3-piece': { pieceType: '3-piece', definitePieces: true,  stitched: 'unstitched', includes: ['shirt', 'trouser', 'dupatta'],     dressStyle: 'shalwar-kameez' },
  'co-ord':             { pieceType: '2-piece', definitePieces: true,  stitched: 'stitched',   includes: ['top', 'bottom'],                   dressStyle: 'co-ord' },
  'western':            { pieceType: '1-piece', definitePieces: false, stitched: 'stitched',   includes: ['top'],                             dressStyle: 'western' },
  // Ambiguous merchandising buckets — let text decide piece count / stitching.
  'festive':            { pieceType: '3-piece', definitePieces: false, stitched: null,         includes: ['shirt', 'trouser', 'dupatta'],     dressStyle: 'shalwar-kameez' },
  'bridal':             { pieceType: '3-piece', definitePieces: false, stitched: 'stitched',   includes: ['shirt', 'trouser', 'dupatta'],     dressStyle: 'lehenga' },
  'other':              { pieceType: undefined, definitePieces: false, stitched: null,         includes: [],                                  dressStyle: undefined }
};

function canonicalFor(subCategory) {
  return SUBCATEGORY_CANONICAL[subCategory] || SUBCATEGORY_CANONICAL['other'];
}

const PIECE_COUNT = { '1-piece': 1, '2-piece': 2, '3-piece': 3, '4-piece': 4 };

// Generic suit buckets whose label should follow a title-driven piece/stitch override.
const GENERIC_SUIT_SUBCATS = new Set([
  '2-piece', '3-piece', '4-piece',
  'unstitched-1-piece', 'unstitched-2-piece', 'unstitched-3-piece'
]);

// ─── Structured title/description parsing ───────────────────────────────────
// Pakistani brand pages are semi-structured: titles list the garments
// ("RTS | SHIRT & TROUSER") and descriptions carry explicit labels
// ("Unstitched 2-Piece", "2 Pc Outfit", "Color: Grey", "Fabric: Lawn",
// "What You'll Get: Shirt+Trouser"). These are RELIABLE signals — not marketing
// noise — so we parse them.

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4 };

/**
 * Explicit "N Piece / N Pc" (digit or word) in a TITLE. Titles are clean product
 * names, so a bare count is trustworthy here.
 */
function explicitPieceCount(txt) {
  const d = txt.match(/\b([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\b/);
  if (d) return Number(d[1]);
  const w = txt.match(/\b(one|two|three|four)[\s-]piece\b/);
  if (w) return WORD_NUM[w[1]];
  return null;
}

/**
 * Piece count from a DESCRIPTION — stricter than the title version. Only trusts a
 * count in a structured garment phrase ("Unstitched 2-Piece", "2 Pc Outfit",
 * "3 Piece Suit"). This avoids the embroidery-breakdown trap where descriptions
 * open with "1 PC Embroidered Front, 2 PC Sleeves, 1 PC Border …" (component
 * counts, not the number of garments).
 */
function explicitPieceCountDesc(head) {
  let m = head.match(/\bunstitched\s+([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\b/);
  if (m) return Number(m[1]);
  m = head.match(/\b([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\s+(?:outfit|suit|stitched|unstitched)\b/);
  if (m) return Number(m[1]);
  m = head.match(/\b(one|two|three|four)[\s-]piece\s+(?:outfit|suit)\b/);
  if (m) return WORD_NUM[m[1]];
  return null;
}

const GARMENT_GROUPS = [
  { label: 'shirt',   re: /\b(shirt|kameez|kurta|kurti|angrakha|frock|tunic|top|abaya|gown)s?\b/ },
  { label: 'blouse',  re: /\b(bustier|choli|blouse)s?\b/ },
  { label: 'trouser', re: /\b(trouser|pant|culotte|shalwar|salwar|pajama|pyjama|bottom|short|lehenga|sharara|gharara)s?\b/ },
  { label: 'dupatta', re: /\b(dupatta|dopatta|duppata|shawl|stole|scarf|scarves)s?\b/ },
  { label: 'inner',   re: /\b(inner|slip|lining|camisole)s?\b/ }
];
const GARMENT_ORDER = ['shirt', 'blouse', 'trouser', 'dupatta', 'inner'];

// A single standalone bottom / dupatta gets its own subCategory rather than the
// collection default (fixes "RTW | TROUSER" or "Cotton Dyed Trouser" that inherit
// a 'kurta' bucket and list [shirt]).
const SINGLE_GARMENT_SUBCAT = { trouser: 'pants', shalwar: 'shalwar', dupatta: 'dupatta' };

/** Ordered garment labels present in a short enumeration segment. */
function garmentsIn(seg) {
  const out = [];
  for (const g of GARMENT_GROUPS) if (g.re.test(seg)) out.push(g.label);
  return out;
}

/**
 * Parse the AUTHORITATIVE composition from an explicit list in the text:
 *   "What You'll Get: Shirt+Dupatta ( Pants Not Included )"  → [shirt, dupatta]
 *   "Separates: Shirt, Bustier, Trouser & Dupatta"           → [shirt, blouse, trouser, dupatta]
 *   "2 Pc Outfit - Shirt & Shalwar"                          → [shirt, trouser]
 * Honours "( … Not Included )" negation and "Paired With …" additions. Returns the
 * ordered garment list, or null when no explicit list is present.
 */
const NEG_CLAUSE = /\([^)]*\bnot\s+in\w*ed\b[^)]*\)/gi; // "( Pants Not Included )" (typo-tolerant)

function parseComposition(titleLc, descLc) {
  const m =
    descLc.match(/what you'?ll get\s*:?\s*(.*?)(?:\bfit\s*:|\bmodel\b|$)/) ||
    descLc.match(/\bseparates\s*:?\s*(.*?)(?:\bfabric\b|\bnote\b|\bcolou?r\s*:|$)/) ||
    descLc.match(/\boutfit\s*[-–]\s*(.*?)(?:\bfabric\b|\bfit\b|$)/);
  if (!m) return null;

  let seg = m[1] || '';
  // Garments named inside a "(… Not Included)" clause are EXCLUDED.
  const excluded = new Set();
  for (const nc of seg.match(NEG_CLAUSE) || []) for (const g of garmentsIn(nc)) excluded.add(g);
  seg = seg.replace(NEG_CLAUSE, ' ');

  const set = new Set(garmentsIn(seg));
  // "Paired With …" elsewhere in the copy names additional included pieces.
  const pw = descLc.match(/paired with\s+([^.]{0,60})/);
  if (pw) for (const g of garmentsIn(pw[1])) set.add(g);
  for (const g of excluded) set.delete(g);

  const garments = GARMENT_ORDER.filter((g) => set.has(g));
  return garments.length ? garments : null;
}

/**
 * Merge the TITLE-after-"|" enumeration with a "What You'll Get:" / "Outfit -"
 * segment. Used only as a fallback when there's no authoritative composition.
 */
function garmentList(titleLc, descLc) {
  const titleSeg = titleLc.includes('|') ? titleLc.split('|').pop() : titleLc;
  const fromTitle = garmentsIn(titleSeg);
  const w =
    descLc.match(/what you'?ll get\s*:?\s*([^.]{0,70})/) ||
    descLc.match(/\boutfit\s*[-–]\s*([^.]{0,70})/);
  const fromDesc = w ? garmentsIn(w[1]) : [];
  return GARMENT_ORDER.filter((g) => fromTitle.includes(g) || fromDesc.includes(g));
}

/**
 * Resolve piece count + garments. An explicit "What You'll Get"/"Separates" list
 * is AUTHORITATIVE (it literally states the contents, incl. exclusions); otherwise
 * fall back to explicit "N Piece" in title/description, then the merged garment
 * enumeration. Piece count excludes a bonus slip/inner.
 */
function resolvePieceSignal(titleLc, descLc) {
  const composition = parseComposition(titleLc, descLc);
  if (composition) {
    const mainCount = composition.filter((g) => g !== 'inner').length || 1;
    return { count: mainCount, garments: composition, strong: true };
  }

  const descHead = descLc.slice(0, 120); // structured labels sit at the very start
  const explicitTitle = explicitPieceCount(titleLc);
  const explicitDesc = explicitPieceCountDesc(descHead);
  const garments = garmentList(titleLc, descLc);

  const count = explicitTitle || explicitDesc || (garments.length || null);
  const singleNonShirt = garments.length === 1 && garments[0] !== 'shirt';
  const strong = !!(explicitTitle || explicitDesc || garments.length >= 2) && !singleNonShirt;

  return { count: count || null, garments, strong };
}

/** Explicit piece count stated in the product TITLE, or null (string form). */
function explicitPieceFromTitle(titleLc) {
  const n = explicitPieceCount(titleLc);
  if (n) return `${n}-piece`;
  if (/\bpant\s*coat\b|\bcoat\s*pant\b/.test(titleLc)) return '3-piece';
  return null;
}

function suitSubCategory(n, stitchedType) {
  if (stitchedType === 'unstitched') {
    if (n <= 1) return 'unstitched-1-piece';
    if (n === 2) return 'unstitched-2-piece';
    if (n === 3) return 'unstitched-3-piece';
    return 'unstitched-4-piece';
  }
  // Stitched single piece has no '1-piece' subCategory in the schema → 'kurta'.
  // Stitched 2/3/4-piece are all valid enum values.
  return n === 1 ? 'kurta' : `${n}-piece`;
}

/**
 * Realign the subCategory so it stays coherent with the resolved piece count /
 * stitching:
 *   - When the TITLE explicitly states a piece count, that is authoritative and
 *     reclassifies even a single-garment bucket (e.g. a "2 Piece Suit" listed in a
 *     'kurta' collection becomes '2-piece').
 *   - Otherwise only the generic suit buckets follow a stitching override (e.g. a
 *     '2-piece' collection item whose title says "Unstitched" → 'unstitched-2-piece').
 *   - kurta/pants/dupatta/festive/bridal/western/co-ord keep their label.
 */
function reconcileSubCategory(subCategory, pieceType, stitchedType, strongSignal) {
  const n = PIECE_COUNT[pieceType];
  if (!n) return subCategory;
  if (strongSignal) return suitSubCategory(n, stitchedType);
  if (GENERIC_SUIT_SUBCATS.has(subCategory)) return suitSubCategory(n, stitchedType);
  return subCategory;
}

// Distinctive silhouettes whose presence in the TITLE is trustworthy enough to
// override the collection's default dress style (a real lehenga/saree/gown).
const DISTINCTIVE_DRESS_STYLE = [
  { kw: ['saree', 'sari'], val: 'saree' },
  { kw: ['lehenga', 'lehnga', 'lehenga choli', 'sharara', 'gharara'], val: 'lehenga' },
  { kw: ['abaya'], val: 'abaya' },
  { kw: ['floor length gown', 'evening gown', 'gown'], val: 'gown' },
  { kw: ['maxi dress', 'maxi frock', 'maxi gown', 'maxi'], val: 'maxi' },
  { kw: ['frock', 'a-line frock'], val: 'frock' },
  { kw: ['palazzo'], val: 'palazzo' }
];

// SubCategories whose composition is a fixed single garment / special set — these
// keep their canonical includes rather than a shirt+trouser+dupatta derivation.
const SPECIAL_COMPOSITION = new Set(['kurta', 'pants', 'shalwar', 'dupatta', 'western', 'co-ord']);

// Standard suit composition by piece count (dupatta only appears from 3 pieces up).
const SUIT_PIECES = {
  1: ['shirt'],
  2: ['shirt', 'trouser'],
  3: ['shirt', 'trouser', 'dupatta'],
  4: ['shirt', 'trouser', 'dupatta', 'inner']
};

/**
 * Build the included-pieces list from the RESOLVED pieceType + stitching, so the
 * composition always agrees with the piece count (a 2-piece can never carry a
 * dupatta). Special single-garment subCategories keep their canonical list.
 * Unstitched suits use fabric-* tokens.
 */
function resolvePieceDetails(subCategory, pieceType, stitchedType, canonical, garments = []) {
  if (SPECIAL_COMPOSITION.has(subCategory)) {
    const includes = [...canonical.includes];
    return { includes, totalCount: PIECE_COUNT[pieceType] || includes.length || undefined };
  }

  const count = PIECE_COUNT[pieceType];
  if (!count) {
    // Unknown piece count (e.g. subCategory 'other') — leave composition open.
    return { includes: [], totalCount: undefined };
  }

  // Prefer the actual garment enumeration when it matches the count (captures
  // shirt+dupatta vs the default shirt+trouser); otherwise standard composition.
  let includes = garments.length === count && garments.includes('shirt')
    ? [...garments]
    : [...(SUIT_PIECES[count] || [])];
  // A slip / inner listed in the garment enumeration is a bonus piece the brand
  // doesn't count in the "N-piece" total — record it in includes without changing
  // totalCount (e.g. "3 PIECE … Shirt+Slip+Pant+Dupatta").
  if (garments.includes('inner') && !includes.includes('inner')) includes.push('inner');
  // Plain garment tokens (shirt/trouser/dupatta/inner) regardless of stitching —
  // the stitchedType field already conveys stitched vs unstitched.
  return { includes, totalCount: count };
}

// ─── Color family derivation ──────────────────────────────────────────────────
const FAMILY_MAP = {
  Red: 'red', Blue: 'blue', Green: 'green', Yellow: 'yellow',
  Pink: 'pink', Purple: 'purple', Orange: 'orange', Brown: 'earth',
  Gold: 'earth', Beige: 'earth', Teal: 'teal', Grey: 'neutral', Black: 'neutral',
  White: 'neutral', Multicolor: 'multicolor'
};

// ─── Negative keywords (non-clothing filter) ──────────────────────────────────
const NEGATIVE_KEYWORDS = [
  // Home & bedding
  'bedsheet','bed sheet','bedding','quilt','cushion','pillow','duvet','towel',
  'rug','home decor','throw blanket','fleece throw','single ply fleece','blanket',
  // Accessories & non-clothing
  'wallet','handbag','tote bag','shoulder bag','crossbody',
  'clutch bag','backpack','satchel','phone case','sunglasses','necklace',
  'earring','bracelet','ring','phone cover',
  // Belts (accessory, not a garment) — ' belt ' avoids matching "belted" dresses.
  'belts',' belt ',
  // Fragrance
  'perfume','fragrance','cologne','eau de toilette','body mist','deodorant',
  // Shoes (filtering from clothing scraper)
  'pumps ifs','loafers ifs','sneakers ifs','boots ifs',
  // Catch-all
  'throw pillow','table cloth','curtain'
];

// ─── Main normalizer ──────────────────────────────────────────────────────────
export function normalizeProduct(raw, brandConfig) {
  if (!raw || !brandConfig) return null;

  const { brand, category, subCategory: configSubCategory,
          occasion: configOccasion = [], style: configStyle = [], source } = brandConfig;

  const name = (raw.title || raw.name || '').trim();
  if (!name || name.length < 3) return null;

  // ── Non-clothing filter ──
  const searchBlob = [name, raw.productType || '', (raw.tags || []).join(' ')]
    .join(' ').toLowerCase();
  if (NEGATIVE_KEYWORDS.some(kw => searchBlob.includes(kw))) return null;

  // ── Price ──
  const price = raw.price;
  if (!price || price <= 0) return null;

  // ── Images ──
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  if (raw.imageUrl && !images.includes(raw.imageUrl)) images.unshift(raw.imageUrl);
  if (images.length === 0) return null;

  // ── URL ──
  const productUrl = (raw.productUrl || '').trim();
  if (!productUrl || !productUrl.startsWith('http')) return null;

  // ── Stock check ──
  if (raw.isAvailable === false) return null;

  // ── Text blobs for inference ──
  const textBlob = [name, raw.description || '', (raw.tags || []).join(' '),
                    (raw.variantOptions || []).join(' ')].join(' ').toLowerCase();
  const titleLc = name.toLowerCase();
  const descLc  = (raw.description || '').toLowerCase();

  // ── Colors — most trusted first: the description's "Color:" label and the
  // Shopify variant colour option, then title, tags, copy. ──
  const descColor = colorFromDesc(descLc);
  const optionColors = [descColor, ...(Array.isArray(raw.variantOptions) ? raw.variantOptions : [])].filter(Boolean);
  const { primaryColor, colors, primaryExactColor, exactColors } = inferColors({
    options: optionColors,
    title: name,
    tags: raw.tags,
    description: raw.description
  });
  const colorFamily = FAMILY_MAP[primaryColor] || 'multicolor';

  // ── Occasion, style, subCategory ──
  let occasions = dedupe([...configOccasion, ...inferFromMap(textBlob, OCCASION_MAP)]);
  if (occasions.includes('eid') || /\beid\b/.test(textBlob)) {
    if (!occasions.includes('party')) occasions.push('party');
  }
  if (occasions.includes('festive') || textBlob.includes('festive')) {
    if (!occasions.includes('party')) occasions.push('party');
  }
  if (occasions.includes('mehndi')) {
    if (!occasions.includes('party')) occasions.push('party');
  }
  occasions = dedupe(occasions);

  const styles      = dedupe([...configStyle,    ...inferFromMap(textBlob, STYLE_MAP)]);
  const subCategory = inferSubCategory(textBlob, configSubCategory);

  // ── Piece system (structured title/description signals, config fallback) ──
  // Titles list the garments ("RTS | SHIRT & TROUSER") and descriptions carry
  // explicit labels ("Unstitched 2-Piece", "2 Pc Outfit"). These reliable signals
  // override the collection when they disagree; loose marketing prose is ignored.
  const pieceSignal  = resolvePieceSignal(titleLc, descLc);
  // A single standalone bottom / dupatta overrides the collection bucket — but
  // ONLY for an actual 1-piece item. A multi-piece "3 Piece Suit with … Dupatta"
  // names just the dupatta in its title; it must NOT be reclassified as a dupatta.
  const soleGarment =
    pieceSignal.garments.length === 1 && (pieceSignal.count == null || pieceSignal.count === 1)
      ? pieceSignal.garments[0]
      : null;
  const baseSubCategory =
    soleGarment && SINGLE_GARMENT_SUBCAT[soleGarment] ? SINGLE_GARMENT_SUBCAT[soleGarment] : subCategory;

  const canonical0   = canonicalFor(baseSubCategory);
  const stitchedType = inferStitchedType(titleLc, descLc, canonical0);
  const pieceType    = pieceSignal.count ? `${pieceSignal.count}-piece` : canonical0.pieceType;
  // Keep subCategory coherent with a strong piece/stitch signal (e.g. a
  // "SHIRT & TROUSER" 2-piece listed in a 'kurta'/generic collection).
  const resolvedSubCategory = reconcileSubCategory(baseSubCategory, pieceType, stitchedType, pieceSignal.strong);
  const canonical    = canonicalFor(resolvedSubCategory);
  const pieceDetails = resolvePieceDetails(resolvedSubCategory, pieceType, stitchedType, canonical, pieceSignal.garments);

  // ── Style / pattern / fashion ──
  const dressStyle  = inferDressStyle(titleLc, canonical);
  const fashionType = inferFashionType(textBlob, resolvedSubCategory);
  const pattern     = inferPattern(textBlob);
  const season      = inferSeason(textBlob);
  const gender = resolveGender(titleLc, raw.tags || [], brandConfig.gender, descLc);
  // NOTE: women-only filtering happens in BaseAdapter (post-validation) so that
  // an intentionally-rejected men's/kids' item is not mistaken for a parse
  // failure and sent through the LLM repair path.
  const fabric      = inferFabric(titleLc, descLc);
  const trendTags   = dedupe(inferFromMap(textBlob, TREND_TAG_MAP));
  const sleeveType  = inferFirstFromMap(textBlob, SLEEVE_MAP);
  const neckline    = inferFirstFromMap(textBlob, NECKLINE_MAP);
  const fitType     = inferFirstFromMap(textBlob, FIT_MAP);

  // ── Sizes ──
  const sizes          = Array.isArray(raw.sizes) ? raw.sizes.slice(0, 20) : [];
  const normalizedSizes = normalizeSizes(sizes);

  // ── Price range ──
  const priceRange = price < 3000 ? 'low' : price <= 8000 ? 'mid' : 'high';

  // ── Metadata score ──
  const metadataScore = computeScore({
    name, price, images, colors, occasions, styles, description: raw.description,
    fabric, dressStyle, pieceType, pattern, sleeveType, neckline, fitType
  });

  return {
    name: name.slice(0, 200),
    brand,
    category: 'clothing',
    subCategory: resolvedSubCategory,
    pieceType,
    pieceDetails,
    stitchedType,
    dressStyle,
    fashionType,
    gender,
    occasion: occasions,
    season,
    fabric,
    pattern,
    colors,
    primaryColor,
    exactColors,
    primaryExactColor,
    colorFamily,
    sizes,
    normalizedSizes,
    priceRange,
    trendTags,
    style: styles,
    sleeveType,
    neckline,
    fitType,
    images,
    imageUrl: images[0],
    description: (raw.description || '').slice(0, 2000),
    tags:  Array.isArray(raw.tags) ? raw.tags.slice(0, 30) : [],
    price,
    compareAtPrice: raw.compareAtPrice || undefined,
    currency: 'PKR',
    productUrl,
    source: source || brand,
    handle: raw.handle || undefined,
    aiEnriched: false,
    metadataScore
  };
}

// ─── Validator ────────────────────────────────────────────────────────────────
export function validateProduct(product) {
  if (!product) return { valid: false, reason: 'null product' };
  for (const field of REQUIRED_FIELDS) {
    if (!product[field] || (Array.isArray(product[field]) && product[field].length === 0)) {
      return { valid: false, reason: `missing: ${field}` };
    }
  }
  if (product.price <= 0) return { valid: false, reason: 'invalid price' };
  if (!product.productUrl.startsWith('http')) return { valid: false, reason: 'invalid url' };
  return { valid: true };
}

// ─── Inference helpers ────────────────────────────────────────────────────────
function inferFromMap(blob, map) {
  const found = [];
  for (const { kw, val } of map) {
    if (kw.some(k => blob.includes(k))) found.push(val);
  }
  return found;
}

function inferFirstFromMap(blob, map) {
  for (const { kw, val } of map) {
    if (kw.some(k => blob.includes(k))) return val;
  }
  return undefined;
}

function inferSubCategory(blob, configDefault) {
  if (configDefault && configDefault !== 'other') return configDefault;
  for (const [sub, kws] of Object.entries(SUBCATEGORY_KW)) {
    if (kws.some(k => blob.includes(k))) return sub;
  }
  return configDefault || 'other';
}

function inferStitchedType(titleLc, descLc, canonical) {
  const descHead = descLc.slice(0, 90);
  // Explicit title signals win (checked most-specific first — note 'unstitched'
  // and 'semi-stitched' both contain the substring 'stitched'). 'RTS' = Ready To
  // Stitch (unstitched); 'RTW'/'pret'/'N Pc Outfit' = ready to wear (stitched).
  if (/semi[\s-]?stitched/.test(titleLc)) return 'semi-stitched';
  if (/\bunstitched\b|un-stitched|\brts\b|ready[ -]?to[ -]?stitch/.test(titleLc)) return 'unstitched';
  if (/\bstitched\b|\brtw\b|ready[ -]?to[ -]?wear|\bpret\b|\bpc\s+outfit\b/.test(titleLc)) return 'stitched';
  // Then the description's leading label ("Unstitched 3-Piece …" / "2 Pc Outfit …").
  if (/unstitched/.test(descHead)) return 'unstitched';
  if (/\bstitched\b|\bpc\s+outfit\b/.test(descHead)) return 'stitched';
  // Otherwise trust the collection (unstitched-* / stitched pret buckets).
  if (canonical && canonical.stitched) return canonical.stitched;
  return 'stitched';
}

function inferDressStyle(titleLc, canonical) {
  // Only a distinctive silhouette in the TITLE overrides the collection default.
  // Scanning the description caused mislabels — a "Tunic"/"Kurta"/"Suit" whose copy
  // merely says "pairs with a lehenga/sharara" was wrongly tagged dressStyle=lehenga
  // (which then surfaced cheap suits under a "bridal lehenga" search).
  for (const { kw, val } of DISTINCTIVE_DRESS_STYLE) {
    if (kw.some((k) => titleLc.includes(k))) return val;
  }
  return canonical?.dressStyle;
}

function inferFashionType(blob, subCategory) {
  for (const { kw, val } of FASHION_TYPE_MAP) {
    if (kw.some(k => blob.includes(k))) return val;
  }
  if (subCategory === 'western') return 'western';
  return 'eastern';
}

function inferPattern(blob) {
  for (const { kw, val } of PATTERN_MAP) {
    if (kw.some(k => blob.includes(k))) return val;
  }
  return undefined;
}

function inferSeason(blob) {
  const seasons = [];
  for (const { kw, val } of SEASON_MAP) {
    if (kw.some(k => blob.includes(k))) seasons.push(val);
  }
  return seasons.length > 0 ? seasons : ['all-season'];
}

function inferGender(blob) {
  for (const { kw, val } of GENDER_MAP) {
    if (kw.some(k => blob.includes(k))) return val;
  }
  return 'women';
}

/**
 * Resolve gender with explicit product-text signals taking precedence over the
 * collection's configured default. A women-only collection can still surface
 * men's/kids' items when the scraper falls back to a site-wide product pool, so
 * a clear "men"/"boys"/"kids" signal in the text must be honoured (and dropped
 * downstream) rather than silently forced to 'women'.
 */
const G_WOMEN  = /\b(women|womens|women's|ladies|female)\b/;
const G_MEN    = /\b(men|mens|men's|gents|gentlemen|male)\b/;
const G_KIDS   = /\b(kids|kid's|child|children|junior|toddler|infant|girls?|boys?|baby)\b/;
const G_UNISEX = /\b(unisex|gender[\s-]?neutral)\b/;

function resolveGender(nameLc, tags, brandGender, descLc = '') {
  // 1. The NAME is the most reliable signal.
  const nameWomen = G_WOMEN.test(nameLc);
  if (G_UNISEX.test(nameLc)) return 'unisex';
  if (G_MEN.test(nameLc) && !nameWomen) return 'men';
  if (G_KIDS.test(nameLc) && !nameWomen) return 'kids';

  // 2. CLEAN (digit-free) tags are real category tags; tags with digits are
  //    merchandising codes ("B20-Girl B") whose gender words are meaningless.
  const cleanTags = (Array.isArray(tags) ? tags : [])
    .filter((t) => !/\d/.test(t) && !/size|chart|guide|care|wash|dhldes|desc/i.test(t))
    .join(' ').toLowerCase();
  const tagWomen = G_WOMEN.test(cleanTags);
  if (G_UNISEX.test(cleanTags)) return 'unisex';
  if (G_MEN.test(cleanTags) && !tagWomen) return 'men';
  if (G_KIDS.test(cleanTags) && !tagWomen) return 'kids';

  // 3. Description is noisy marketing prose, so it's only consulted once name and
  //    tags gave no signal at all — e.g. "For children aged 5-10" with a generic title.
  const descWomen = G_WOMEN.test(descLc);
  if (G_UNISEX.test(descLc)) return 'unisex';
  if (G_MEN.test(descLc) && !descWomen) return 'men';
  if (G_KIDS.test(descLc) && !descWomen) return 'kids';

  // 4. Collection default, then any women signal, then default (women-only catalog).
  if (brandGender && ['women', 'men', 'kids', 'unisex'].includes(brandGender)) return brandGender;
  return 'women';
}

// Multi-word entries first so "raw silk"/"cotton net"/"cotton silk" win over
// bare "silk"/"cotton". Covers the fabrics seen across all 8 brands.
const FABRICS = [
  'cotton filament','cotton net','cotton silk','cotton viscose','raw silk','tissue silk',
  'poly tissue silk',
  'poly slub','poly munar','poly munaar','poly lawn','two way slub','two tone','yarn dyed','viscose slub',
  'lurex jacquard','self jacquard','irish linen','dobby lawn','zari lawn','bamber chiffon','munaar lurex',
  'khaddar','karandi','masoori','susi','doria','dobby','marina','jamawar','banarsi','katan',
  'leno karha','leno','munaar','munar','lurex','lawn','chiffon','georgette','velvet','organza','cambric','jacquard','herringbone',
  'linen','crepe','satin','tissue','muslin','voile','viscose','pashmina','net',
  'polyester','poly','cotton','silk','zari'
];

const titleCase = (s) => s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/**
 * Find the fabric that appears EARLIEST in the text (so the base fabric wins over
 * an embellishment thread — "Polyester Zari" → Polyester); at the same position
 * the longest phrase wins ("Cotton Net" over "Cotton").
 */
function scanFabric(txt) {
  let best = null, bestIdx = Infinity, bestLen = 0;
  for (const f of FABRICS) {
    const i = txt.indexOf(f);
    if (i === -1) continue;
    if (i < bestIdx || (i === bestIdx && f.length > bestLen)) {
      best = f; bestIdx = i; bestLen = f.length;
    }
  }
  return best ? titleCase(best) : undefined;
}

// Treatment words that can prefix a fabric label ("Dyed Embroidered Lawn" → Lawn).
const NON_FABRIC_LABEL = /^(dyed|printed|embroidered|plain|solid|self|digital)$/i;

/**
 * The description's FIRST "Fabric: X" label is the shirt (primary) fabric and is
 * the most reliable source for these brands. Value is captured up to the next
 * known label. Returns a cleaned fabric string or null.
 */
function fabricFromDesc(descLc) {
  const m = descLc.match(
    /fabric\s*:\s*([a-z][a-z ]{1,26}?)\s*(?:\(|dupatta|trouser|shirt|bottom|colou?r|cut|slip|design|what|care|season|occasion|details|neckline|composition|material|note|weight|\bfit\b|$)/
  );
  if (!m) return null;
  let words = m[1].trim().replace(/\s+/g, ' ').split(' ');
  // Strip ONLY leading treatment words — keep interior words so multi-word
  // fabrics survive ("Yarn Dyed Cotton Silk" must not become "Yarn Cotton Silk").
  while (words.length && NON_FABRIC_LABEL.test(words[0])) words.shift();
  const val = words.join(' ').trim();
  return val ? titleCase(val) : null;
}

/**
 * Fabric stated in the description PROSE as "… <fabric> fabric" (e.g. Gul Ahmed
 * "Crafted in breezy tissue silk fabric"). Uses the FIRST such mention (the shirt
 * fabric is named first) and only accepts it if it resolves to a known fabric —
 * this beats a leading blend-qualifier in the title ("Poly Tissue Silk" → Poly).
 */
function fabricFromDescBody(descLc) {
  const re = /\b([a-z]+(?:\s+[a-z]+){0,2})\s+fabric\b/g;
  let m;
  while ((m = re.exec(descLc))) {
    const f = scanFabric(m[1]);
    if (f) return f;
  }
  return null;
}

/**
 * Fabric resolution, most-reliable first:
 *   "Fabric:" label  →  "<fabric> fabric" prose  →  TITLE fabric word  →  wider text.
 * Marketing prose is never scanned loosely for a bare fabric word — only the two
 * explicit forms above are trusted.
 */
function inferFabric(titleLc, descLc) {
  return fabricFromDesc(descLc) || fabricFromDescBody(descLc) || scanFabric(titleLc) || scanFabric(descLc);
}

/** Public helper: derive fabric from a product's name + description. */
export function deriveFabric(name, description) {
  return inferFabric((name || '').toLowerCase(), (description || '').toLowerCase());
}

/** Public helper: derive gender from a product's name + tags (women-only QA). */
export function deriveGender(name, tags) {
  return resolveGender((name || '').toLowerCase(), tags || [], undefined);
}

/** Public helper: re-derive dressStyle from a product's name + its subCategory. */
export function deriveDressStyle(name, subCategory) {
  return inferDressStyle((name || '').toLowerCase(), canonicalFor(subCategory));
}

/** The description's "Color: X" label value (e.g. "Baby Pink", "Olive Grey"), or null. */
function colorFromDesc(descLc) {
  const m = descLc.match(
    /\bcolou?r\s*:\s*([a-z][a-z ()]{1,22}?)\s*(?:fabric|shirt|cut|slip|dupatta|trouser|bottom|design|what|care|season|occasion|details|neckline|\bfit\b|$)/
  );
  return m ? m[1].trim() : null;
}

// ─── Size normalizer ─────────────────────────────────────────────────────────
const ALPHA_SIZES = new Set(['XS','S','M','L','XL','XXL','XXXL','2XL','3XL']);
const WAIST_RANGE = [24, 26, 28, 30, 32, 34, 36, 38, 40];
const NUMERIC_SIZES = new Set([6, 8, 10, 12, 14, 16, 18, 20]);

function normalizeSizes(rawSizes) {
  if (!rawSizes || rawSizes.length === 0) return [];
  const result = [];
  for (const s of rawSizes) {
    const upper = String(s).trim().toUpperCase();
    const num   = parseFloat(s);

    if (/^(free size|one size|os|free|onesize)$/i.test(upper)) {
      result.push({ type: 'free', value: 'Free Size' });
    } else if (ALPHA_SIZES.has(upper)) {
      result.push({ type: 'alpha', value: upper });
    } else if (!isNaN(num)) {
      if (WAIST_RANGE.includes(num)) {
        result.push({ type: 'waist', value: num });
      } else if (NUMERIC_SIZES.has(num)) {
        result.push({ type: 'numeric', value: num });
      } else {
        result.push({ type: 'numeric', value: num });
      }
    } else {
      result.push({ type: 'alpha', value: upper });
    }
  }
  return result;
}

// ─── Metadata score ───────────────────────────────────────────────────────────
function computeScore({ name, price, images, colors, occasions, styles,
                        description, fabric, dressStyle, pieceType, pattern,
                        sleeveType, neckline, fitType }) {
  let s = 0;
  if (name)                           s += 0.15;
  if (price > 0)                      s += 0.10;
  if (images.length > 0)             s += 0.10;
  if (colors.length > 0 && colors[0] !== 'Multicolor') s += 0.10;
  if (occasions.length > 0)          s += 0.10;
  if (styles.length > 0)             s += 0.05;
  if (description && description.length > 20) s += 0.05;
  if (fabric)                         s += 0.08;
  if (dressStyle)                     s += 0.08;
  if (pieceType)                      s += 0.07;
  if (pattern)                        s += 0.05;
  if (sleeveType)                     s += 0.03;
  if (neckline)                       s += 0.02;
  if (fitType)                        s += 0.02;
  return parseFloat(s.toFixed(2));
}

function dedupe(arr) {
  return [...new Set(arr)];
}

/** Public alias for pipeline / external tools */
export const inferProduct = normalizeProduct;
