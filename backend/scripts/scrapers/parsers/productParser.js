/**
 * productParser.js
 * Normalizes raw extracted product data into our full Product schema.
 * Validates completeness. NO fake data generation — returns null for invalid products.
 */

import { inferColors } from '../utils/colorInference.js';

// ─── Required fields for a valid product ─────────────────────────────────────
const REQUIRED_FIELDS = ['name', 'price', 'productUrl', 'images'];

// ─── Occasion inference from tags / title ─────────────────────────────────────
const OCCASION_MAP = [
  { keywords: ['wedding', 'bridal', 'nikah', 'barat', 'valima'], occasion: 'wedding' },
  { keywords: ['eid', 'festive', 'celebration', 'festive-wear'], occasion: 'eid' },
  { keywords: ['party', 'evening', 'cocktail', 'reception'], occasion: 'party' },
  { keywords: ['office', 'work', 'professional', 'formal', 'corporate'], occasion: 'office' },
  { keywords: ['casual', 'everyday', 'daily', 'lounge'], occasion: 'casual' },
  { keywords: ['mehndi', 'haldi', 'mayun'], occasion: 'mehndi' },
  { keywords: ['lawn', 'summer', 'pret'], occasion: 'casual' },
  { keywords: ['winter', 'khaddar', 'karandi', 'linen', 'tweed'], occasion: 'casual' }
];

// ─── Style inference ──────────────────────────────────────────────────────────
const STYLE_MAP = [
  { keywords: ['embroidered', 'embellished', 'zardozi', 'gota', 'tilla', 'stone work'], style: 'embroidered' },
  { keywords: ['printed', 'digital print', 'screen print'], style: 'printed' },
  { keywords: ['minimal', 'solid', 'plain', 'basic'], style: 'minimal' },
  { keywords: ['trendy', 'contemporary', 'modern'], style: 'trendy' },
  { keywords: ['elegant', 'luxury', 'luxe', 'premium', 'couture'], style: 'elegant' },
  { keywords: ['traditional', 'cultural', 'ethnic', 'desi'], style: 'traditional' },
  { keywords: ['western', 'jeans', 'denim', 'tshirt', 't-shirt', 'hoodie'], style: 'western' },
  { keywords: ['heavy', 'bridal', 'chikankari', 'handwork'], style: 'heavy' }
];

// ─── SubCategory keyword overrides (only valid Product schema enum values) ────
// Config-level subCategory takes priority; these only apply when text content
// strongly implies a different classification than the collection default.
// NOTE: 'pret'/'unstitched' are NOT valid enum values — do not add them here.
const SUBCATEGORY_KEYWORDS = {
  '2-piece':            ['2-piece', '2piece', 'two-piece', 'shirt & trouser', 'shirt and trouser'],
  '3-piece':            ['3-piece', '3piece', 'three-piece', 'shirt trouser dupatta'],
  'kurta':              ['kurti', 'kameez', '1-piece', 'one piece'],
  'pants':              ['trousers only', 'bottoms only', 'palazzo', 'cigarette pant'],
  'shalwar':            ['shalwar only', 'salwar only'],
  'dupatta':            ['dupatta only', 'stole only', 'shawl only'],
  'unstitched-2-piece': ['unstitched 2-piece', 'un-stitched 2 piece'],
  'unstitched-3-piece': ['unstitched 3-piece', 'un-stitched 3 piece'],
  'western':            ['western wear', 'jeans', 'denim', 'hoodie', 'sweatshirt', 't-shirt'],
  'festive':            ['bridal', 'wedding wear', 'shadi'],
  'heels':              ['heels', 'stiletto', 'pump', 'block heel', 'court shoe'],
  'flats':              ['ballet flat', 'loafer', 'moccasin'],
  'sandals':            ['sandal', 'chappal', 'slides', 'slipper'],
  'sneakers':           ['sneaker', 'trainer', 'jogger', 'sports shoe'],
  'khussa':             ['khussa', 'mojri', 'juti', 'kohati'],
  'boots':              ['ankle boot', 'long boot', 'knee boot'],
  'mules':              ['mules', 'back-open', 'wedge']
};

// ─── Season inference ─────────────────────────────────────────────────────────
const SEASON_MAP = [
  { keywords: ['summer', 'lawn', 'cotton', 'voile', 'chiffon', 'georgette'], season: 'summer' },
  { keywords: ['winter', 'khaddar', 'karandi', 'linen', 'tweed', 'wool', 'velvet', 'fleece'], season: 'winter' }
];

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * normalizeProduct(raw, brandConfig)
 * Converts raw extracted data + brand config into a Product document.
 * Returns null if validation fails.
 *
 * @param {object} raw         - From Shopify or HTML extractor
 * @param {object} brandConfig - { brand, category, subCategory, occasion, style, source }
 */
export function normalizeProduct(raw, brandConfig) {
  if (!raw || !brandConfig) return null;

  const {
    brand,
    category,
    subCategory: configSubCategory,
    occasion: configOccasion = [],
    style: configStyle = [],
    source
  } = brandConfig;

  // ── Name ────
  const name = (raw.title || raw.name || '').trim();
  if (!name || name.length < 3) return null;

  // ── Price ───
  const price = raw.price;
  if (!price || price <= 0) return null;

  // ── Images ──
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  if (raw.imageUrl && !images.includes(raw.imageUrl)) images.unshift(raw.imageUrl);
  if (images.length === 0) return null;

  // ── URL ─────
  const productUrl = (raw.productUrl || '').trim();
  if (!productUrl || !productUrl.startsWith('http')) return null;

  // ── Colors ──
  const textForColor = [name, raw.description || '', (raw.tags || []).join(' ')].join(' ');
  const { primaryColor, colors } = inferColors(textForColor);

  // ── Occasion ──
  const textBlob = [name, (raw.tags || []).join(' '), raw.description || ''].join(' ').toLowerCase();
  const inferredOccasions = inferOccasions(textBlob);
  const occasions = dedupe([...configOccasion, ...inferredOccasions]);

  // ── Style ──
  const inferredStyles = inferStyles(textBlob);
  const styles = dedupe([...configStyle, ...inferredStyles]);

  // ── SubCategory ──
  const subCategory = inferSubCategory(textBlob, configSubCategory);

  // ── Season ──
  const season = inferSeason(textBlob);

  // ── Metadata score (completeness 0-1) ──
  const metadataScore = computeMetadataScore({ name, price, images, colors, occasions, styles, description: raw.description });

  const normalized = {
    name: name.slice(0, 200),
    brand,
    category,
    subCategory,
    type: raw.productType || raw.type || undefined,
    style: styles,
    occasion: occasions,
    season,
    fabric: inferFabric(textBlob),
    colors,
    primaryColor,
    sizes: Array.isArray(raw.sizes) ? raw.sizes.slice(0, 20) : [],
    images,
    imageUrl: images[0],
    description: (raw.description || '').slice(0, 2000),
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 30) : [],
    price,
    compareAtPrice: raw.compareAtPrice || undefined,
    currency: 'PKR',
    productUrl,
    source: source || brand,
    handle: raw.handle || undefined,
    metadataScore
  };
  
  // Stock Check: Only allow available products
  if (raw.isAvailable === false) return null;

  return normalized;
}

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateProduct(product) {
  if (!product) return { valid: false, reason: 'null product' };
  for (const field of REQUIRED_FIELDS) {
    if (!product[field] || (Array.isArray(product[field]) && product[field].length === 0)) {
      return { valid: false, reason: `missing required field: ${field}` };
    }
  }
  if (product.price <= 0) return { valid: false, reason: 'invalid price' };
  if (!product.productUrl.startsWith('http')) return { valid: false, reason: 'invalid productUrl' };
  return { valid: true };
}

// ─── Inference helpers ────────────────────────────────────────────────────────

function inferOccasions(textBlob) {
  const found = [];
  for (const { keywords, occasion } of OCCASION_MAP) {
    if (keywords.some((k) => textBlob.includes(k))) found.push(occasion);
  }
  return found;
}

function inferStyles(textBlob) {
  const found = [];
  for (const { keywords, style } of STYLE_MAP) {
    if (keywords.some((k) => textBlob.includes(k))) found.push(style);
  }
  return found;
}

function inferSubCategory(textBlob, configDefault) {
  // Config-level subCategory (set per-collection) is authoritative.
  // Keyword inference only kicks in as a last resort when config defaulted to 'other'.
  if (configDefault && configDefault !== 'other') return configDefault;
  for (const [subCat, keywords] of Object.entries(SUBCATEGORY_KEYWORDS)) {
    if (keywords.some((k) => textBlob.includes(k))) return subCat;
  }
  return configDefault || 'other';
}

function inferSeason(textBlob) {
  const seasons = [];
  for (const { keywords, season } of SEASON_MAP) {
    if (keywords.some((k) => textBlob.includes(k))) seasons.push(season);
  }
  return seasons.length > 0 ? seasons : ['all-season'];
}

function inferFabric(textBlob) {
  const fabrics = ['lawn', 'chiffon', 'georgette', 'cotton', 'silk', 'velvet', 'khaddar', 'karandi', 'linen', 'organza', 'net', 'crepe', 'satin'];
  for (const f of fabrics) {
    if (textBlob.includes(f)) return f.charAt(0).toUpperCase() + f.slice(1);
  }
  return undefined;
}

function computeMetadataScore({ name, price, images, colors, occasions, styles, description }) {
  let score = 0;
  if (name) score += 0.2;
  if (price > 0) score += 0.2;
  if (images.length > 0) score += 0.2;
  if (colors.length > 0 && colors[0] !== 'Multicolor') score += 0.1;
  if (occasions.length > 0) score += 0.15;
  if (styles.length > 0) score += 0.1;
  if (description && description.length > 20) score += 0.05;
  return parseFloat(score.toFixed(2));
}

function dedupe(arr) {
  return [...new Set(arr)];
}
