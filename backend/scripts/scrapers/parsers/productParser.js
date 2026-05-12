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

// ─── Piece details lookup ─────────────────────────────────────────────────────
const PIECE_DETAILS = {
  '1-piece':            { includes: ['shirt'],                          totalCount: 1 },
  'kurta':              { includes: ['kurta'],                          totalCount: 1 },
  'pants':              { includes: ['trouser'],                        totalCount: 1 },
  'shalwar':            { includes: ['shalwar'],                        totalCount: 1 },
  'dupatta':            { includes: ['dupatta'],                        totalCount: 1 },
  '2-piece':            { includes: ['shirt', 'trouser'],               totalCount: 2 },
  '3-piece':            { includes: ['shirt', 'trouser', 'dupatta'],    totalCount: 3 },
  '4-piece':            { includes: ['shirt', 'trouser', 'dupatta', 'inner'], totalCount: 4 },
  'bridal':             { includes: ['shirt', 'trouser', 'dupatta'],    totalCount: 3 },
  'festive':            { includes: ['shirt', 'trouser', 'dupatta'],    totalCount: 3 },
  'unstitched-1-piece': { includes: ['fabric-shirt'],                   totalCount: 1 },
  'unstitched-2-piece': { includes: ['fabric-shirt', 'fabric-trouser'], totalCount: 2 },
  'unstitched-3-piece': { includes: ['fabric-shirt', 'fabric-trouser', 'fabric-dupatta'], totalCount: 3 },
  'western':            { includes: ['top'],                            totalCount: 1 },
  'co-ord':             { includes: ['top', 'bottom'],                  totalCount: 2 },
  'other':              { includes: [],                                 totalCount: undefined }
};

// ─── Piece-component tokens (description / title) ────────────────────────────
const PIECE_TOKEN_RULES = [
  { keys: ['dupatta', 'duppata', 'dopatta', 'chiffon dupatta', 'net dupatta', 'organza dupatta'], label: 'dupatta' },
  { keys: ['shawl', 'stole'], label: 'dupatta' },
  { keys: ['trouser', 'pants', 'pant ', 'cigarette pant', 'straight pant', 'culottes'], label: 'trouser' },
  { keys: ['shalwar', 'salwar', 'tulip shalwar', 'gharara', 'sharara'], label: 'shalwar' },
  { keys: ['shirt', 'kameez', 'kurta', 'tunic', 'peplum', 'short kurta'], label: 'shirt' },
  { keys: ['slip', 'inner shirt', 'inner kurta', 'lining'], label: 'inner' },
  { keys: ['waistcoat', 'vest', 'nehru jacket'], label: 'waistcoat' },
  { keys: ['coat', 'blazer', 'jacket (men', 'bandhgala'], label: 'coat' },
  { keys: ['lehenga skirt', 'lehenga', 'ghagra'], label: 'lehenga-skirt' },
  { keys: ['choli', 'blouse'], label: 'choli' }
];

/**
 * Reads title + description for which garment pieces are included.
 */
function mergePieceDetailsFromDescription(blob, pieceType, subCategory, baseDetails) {
  const includes = new Set(baseDetails?.includes?.filter(Boolean) || []);
  for (const { keys, label } of PIECE_TOKEN_RULES) {
    if (keys.some((k) => blob.includes(k))) includes.add(label);
  }
  // Shopify-style "Includes: Shirt, Trouser, Dupatta"
  const incMatch = blob.match(/includes?:\s*([^.;\n]+)/i);
  if (incMatch) {
    const seg = incMatch[1];
    for (const { keys, label } of PIECE_TOKEN_RULES) {
      if (keys.some((k) => seg.includes(k))) includes.add(label);
    }
    if (/shirt|kameez|kurta/i.test(seg)) includes.add('shirt');
    if (/trouser|pant/i.test(seg)) includes.add('trouser');
    if (/dupatta|dopatta/i.test(seg)) includes.add('dupatta');
    if (/shalwar|salwar/i.test(seg)) includes.add('shalwar');
    if (/slip|inner/i.test(seg)) includes.add('inner');
  }
  // "shirt + trouser + dupatta" phrasing
  if (/\bshirt\b.*\btrouser\b.*\bdupatta\b/i.test(blob) || /\bkameez\b.*\bshalwar\b.*\bdupatta\b/i.test(blob)) {
    includes.add('shirt');
    includes.add('trouser');
    includes.add('dupatta');
  }
  if (/\bkurta\b.*\bdupatta\b/i.test(blob) && !includes.has('trouser')) {
    includes.add('kurta');
    includes.add('dupatta');
  }
  const arr = [...includes];
  let total = baseDetails?.totalCount;
  if (typeof total !== 'number' || total < 1) {
    if (pieceType === '1-piece') total = 1;
    else if (pieceType === '2-piece') total = 2;
    else if (pieceType === '3-piece') total = 3;
    else if (pieceType === '4-piece') total = 4;
    else total = arr.length > 0 ? Math.min(4, Math.max(1, arr.length)) : undefined;
  }
  if (arr.length === 0 && baseDetails?.includes?.length) {
    return { includes: [...baseDetails.includes], totalCount: total };
  }
  return { includes: arr.length ? arr : [...(baseDetails?.includes || [])], totalCount: total };
}

// ─── Color family derivation ──────────────────────────────────────────────────
const FAMILY_MAP = {
  Red: 'red', Blue: 'blue', Green: 'green', Yellow: 'yellow',
  Pink: 'pink', Purple: 'purple', Orange: 'orange', Brown: 'earth',
  Gold: 'earth', Teal: 'teal', Grey: 'neutral', Black: 'neutral',
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

  // ── Colors ──
  const { primaryColor, colors, primaryExactColor, exactColors } = inferColors(textBlob);
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

  // ── Piece system ──
  const stitchedType = inferStitchedType(textBlob, subCategory);
  const pieceType    = inferPieceType(subCategory, textBlob);
  let pieceDetails = PIECE_DETAILS[subCategory] || PIECE_DETAILS['other'];
  pieceDetails = mergePieceDetailsFromDescription(textBlob, pieceType, subCategory, pieceDetails);

  // ── Style / pattern / fashion ──
  const dressStyle  = inferDressStyle(textBlob, subCategory);
  const fashionType = inferFashionType(textBlob, subCategory);
  const pattern     = inferPattern(textBlob);
  const season      = inferSeason(textBlob);
  const gender =
    brandConfig.gender && ['women', 'men', 'kids', 'unisex'].includes(brandConfig.gender)
      ? brandConfig.gender
      : inferGender(textBlob);
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
    subCategory,
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

function inferStitchedType(blob, subCategory) {
  if (subCategory && (subCategory.startsWith('unstitched') || subCategory.startsWith('mens-unstitched'))) {
    return 'unstitched';
  }
  if (blob.includes('semi-stitched') || blob.includes('semi stitched')) return 'semi-stitched';
  const unstitchedKw = [
    'unstitched', 'cut piece', 'material only',
    'fabric suit', 'fabric collection', 'unstitched fabric', 'fabric only',
    'ready to stitch', 'ready-to-stitch', 'rts ',
    '2-piece fabric', '3-piece fabric', 'stitched fabric'
  ];
  if (unstitchedKw.some((k) => blob.includes(k))) return 'unstitched';
  const stitchedKw = ['pret', 'ready to wear', 'rtw', 'ready-to-wear', 'stitched', 'outfit', 'assembled'];
  if (stitchedKw.some((k) => blob.includes(k))) return 'stitched';
  return 'stitched';
}

function inferPieceType(subCategory, blob) {
  // 1. Text-first: explicit piece count in product name overrides collection config
  if (/\b4[- ]?piece\b|four[- ]piece/i.test(blob) || blob.includes('4pc')) return '4-piece';
  if (/\b3[- ]?piece\b|three[- ]piece/i.test(blob) || blob.includes('3pc')) return '3-piece';
  if (/\b2[- ]?piece\b|two[- ]piece/i.test(blob) || blob.includes('2pc')) return '2-piece';
  if (/\b1[- ]?piece\b|one[- ]piece/i.test(blob) || blob.includes('1pc')) return '1-piece';
  if (/\bpant\s*coat\b|\bcoat\s*pant\b|three[\s-]piece\s+suit|3[\s-]piece\s+(western|formal)/i.test(blob)) {
    return '3-piece';
  }

  // 2. SubCategory fallback
  if (!subCategory) return undefined;
  if (subCategory.includes('4-piece')) return '4-piece';
  if (subCategory.includes('3-piece') || subCategory === 'festive' || subCategory === 'bridal' || subCategory === 'mens-unstitched-3-piece') {
    return '3-piece';
  }
  if (subCategory.includes('2-piece') || subCategory === 'co-ord' || subCategory === 'mens-unstitched-2-piece') return '2-piece';
  if (
    [
      'kurta',
      'pants',
      'shalwar',
      'dupatta',
      'western',
      'unstitched-1-piece',
      'mens-kurta',
      'mens-shirt-tops',
      'mens-waistcoat',
      'mens-formal-wear',
      'mens-western-sets'
    ].includes(subCategory)
  ) {
    return '1-piece';
  }
  return undefined;
}

function inferDressStyle(blob, subCategory) {
  // Text-first
  for (const { kw, val } of DRESS_STYLE_MAP) {
    if (kw.some(k => blob.includes(k))) return val;
  }
  // SubCategory fallback
  if (['2-piece','3-piece','unstitched-2-piece','unstitched-3-piece','shalwar','festive','bridal'].includes(subCategory)) return 'shalwar-kameez';
  if (subCategory === 'kurta' || subCategory === 'unstitched-1-piece' || subCategory === 'mens-kurta') return 'kurta';
  if (subCategory === 'mens-shirt-tops' || subCategory === 'mens-formal-wear' || subCategory === 'mens-western-sets') {
    return 'shirt';
  }
  if (subCategory === 'mens-waistcoat') return 'jacket';
  if (subCategory === 'mens-shalwar-kameez' || subCategory === 'mens-unstitched-2-piece' || subCategory === 'mens-unstitched-3-piece') {
    return 'shalwar-kameez';
  }
  if (subCategory === 'co-ord') return 'co-ord';
  if (subCategory === 'pants') return 'trouser';
  if (subCategory === 'dupatta') return 'other';
  if (subCategory === 'western') return 'western';
  if (subCategory === 'co-ord') return 'co-ord';
  return undefined;
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
