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
  'unstitched-1-piece': { pieceType: '1-piece', definitePieces: true,  stitched: 'unstitched', includes: ['fabric-shirt'],                    dressStyle: 'shalwar-kameez' },
  'unstitched-2-piece': { pieceType: '2-piece', definitePieces: true,  stitched: 'unstitched', includes: ['fabric-shirt', 'fabric-trouser'],  dressStyle: 'shalwar-kameez' },
  'unstitched-3-piece': { pieceType: '3-piece', definitePieces: true,  stitched: 'unstitched', includes: ['fabric-shirt', 'fabric-trouser', 'fabric-dupatta'], dressStyle: 'shalwar-kameez' },
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

/**
 * When the title overrides the collection's piece count / stitching, realign the
 * subCategory label so it stays coherent (e.g. a "2-piece" collection item whose
 * title says "3 Piece Unstitched" becomes 'unstitched-3-piece'). Only touches the
 * generic suit buckets; kurta/pants/dupatta/festive/bridal/etc. keep their label.
 */
function reconcileSubCategory(subCategory, pieceType, stitchedType) {
  if (!GENERIC_SUIT_SUBCATS.has(subCategory)) return subCategory;
  const n = PIECE_COUNT[pieceType];
  if (!n) return subCategory;
  if (stitchedType === 'unstitched') {
    return n === 1 ? 'unstitched-1-piece' : `unstitched-${n}-piece`;
  }
  // Stitched single piece has no '1-piece' subCategory in the schema → 'kurta'.
  return n === 1 ? 'kurta' : `${n}-piece`;
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
function resolvePieceDetails(subCategory, pieceType, stitchedType, canonical) {
  if (SPECIAL_COMPOSITION.has(subCategory)) {
    const includes = [...canonical.includes];
    return { includes, totalCount: PIECE_COUNT[pieceType] || includes.length || undefined };
  }

  const count = PIECE_COUNT[pieceType];
  if (!count) {
    // Unknown piece count (e.g. subCategory 'other') — leave composition open.
    return { includes: [], totalCount: undefined };
  }

  let includes = SUIT_PIECES[count] || [];
  if (stitchedType === 'unstitched') {
    includes = includes.map((p) => (['shirt', 'trouser', 'dupatta'].includes(p) ? `fabric-${p}` : p));
  }
  return { includes: [...includes], totalCount: count };
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

  // ── Text blob for inference ──
  const textBlob = [name, raw.description || '', (raw.tags || []).join(' '),
                    (raw.variantOptions || []).join(' ')].join(' ').toLowerCase();

  // ── Colors (source-prioritized: variant color option & title over copy) ──
  const { primaryColor, colors, primaryExactColor, exactColors } = inferColors({
    options: raw.variantOptions,
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

  // ── Piece system (title-authoritative, config fallback) ──
  // The product TITLE is a clean, reliable signal and overrides the collection
  // when they disagree (e.g. a "3 Piece … (Unstitched)" suit pulled via a
  // site-wide fallback into a collection configured as 2-piece). The noisy
  // DESCRIPTION is never used for these structural fields.
  const titleLc      = name.toLowerCase();
  const canonical0   = canonicalFor(subCategory);
  const stitchedType = inferStitchedType(titleLc, canonical0);
  const pieceType    = inferPieceType(titleLc, canonical0);
  // Keep subCategory coherent with a title-driven override of a generic suit
  // bucket (e.g. title "3 Piece … Unstitched" in a 2-piece collection).
  const resolvedSubCategory = reconcileSubCategory(subCategory, pieceType, stitchedType);
  const canonical    = canonicalFor(resolvedSubCategory);
  const pieceDetails = resolvePieceDetails(resolvedSubCategory, pieceType, stitchedType, canonical);

  // ── Style / pattern / fashion ──
  const dressStyle  = inferDressStyle(textBlob, canonical);
  const fashionType = inferFashionType(textBlob, resolvedSubCategory);
  const pattern     = inferPattern(textBlob);
  const season      = inferSeason(textBlob);
  const gender = resolveGender(textBlob, brandConfig.gender);
  // NOTE: women-only filtering happens in BaseAdapter (post-validation) so that
  // an intentionally-rejected men's/kids' item is not mistaken for a parse
  // failure and sent through the LLM repair path.
  const fabric      = inferFabric(textBlob);
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

function inferStitchedType(titleLc, canonical) {
  // Explicit title signals win (checked most-specific first — note 'unstitched'
  // and 'semi-stitched' both contain the substring 'stitched').
  if (titleLc.includes('semi-stitched') || titleLc.includes('semi stitched')) return 'semi-stitched';
  if (titleLc.includes('unstitched') || titleLc.includes('un-stitched')) return 'unstitched';
  if (/\b(stitched|pret|ready[ -]?to[ -]?wear|rtw)\b/.test(titleLc)) return 'stitched';
  // Otherwise trust the collection (unstitched-* / stitched pret buckets).
  if (canonical && canonical.stitched) return canonical.stitched;
  return 'stitched';
}

function inferPieceType(titleLc, canonical) {
  // An explicit piece count in the TITLE is authoritative and overrides the
  // collection default (handles mislabeled/site-wide-fallback items).
  if (/\b4[- ]?piece\b|four[- ]piece/.test(titleLc) || titleLc.includes('4pc')) return '4-piece';
  if (/\b3[- ]?piece\b|three[- ]piece/.test(titleLc) || titleLc.includes('3pc')) return '3-piece';
  if (/\b2[- ]?piece\b|two[- ]piece/.test(titleLc) || titleLc.includes('2pc')) return '2-piece';
  if (/\b1[- ]?piece\b|one[- ]piece\b/.test(titleLc) || titleLc.includes('1pc')) return '1-piece';
  if (/\bpant\s*coat\b|\bcoat\s*pant\b|three[\s-]piece\s+suit/.test(titleLc)) return '3-piece';

  // No explicit count in the title — use the collection's piece count.
  return canonical?.pieceType;
}

function inferDressStyle(blob, canonical) {
  // Only distinctive silhouettes may override the collection's default
  // (a genuine lehenga/saree/gown/abaya inside a "3-piece" collection).
  for (const { kw, val } of DISTINCTIVE_DRESS_STYLE) {
    if (kw.some((k) => blob.includes(k))) return val;
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
function resolveGender(blob, brandGender) {
  const textWomen = /\b(women|womens|women's|ladies|girls|female)\b/.test(blob);
  const textMen   = /\b(men|mens|men's|gents|gentlemen|boys|male)\b/.test(blob);
  const textKids  = /\b(kids|kid's|child|children|junior|toddler|infant|baby)\b/.test(blob);

  if (textMen && !textWomen) return 'men';
  if (textKids && !textWomen) return 'kids';
  if (brandGender && ['women', 'men', 'kids', 'unisex'].includes(brandGender)) return brandGender;
  if (textWomen) return 'women';
  // Default for a women-only catalog. IMPORTANT: do NOT fall back to the legacy
  // substring-based inferGender() here — it matches 'men' inside 'women' and would
  // wrongly drop women's items whose tags contain the word "women".
  return 'women';
}

function inferFabric(blob) {
  const fabrics = [
    'lawn','chiffon','georgette','cotton','silk','velvet','khaddar','karandi',
    'linen','organza','net','crepe','satin','jacquard','raw silk','tissue',
    'banarsi','zari','muslin','voile','cambric','viscose','polyester'
  ];
  for (const f of fabrics) {
    if (blob.includes(f)) return f.charAt(0).toUpperCase() + f.slice(1);
  }
  return undefined;
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
