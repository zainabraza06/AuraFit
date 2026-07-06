/**
 * jewelryParser.js — JewelryProduct from Shopify-mapped raw.
 */
import { inferColors } from '../utils/colorInference.js';
import { enrichJewelryProduct } from '../utils/accessoryEnricher.js';

const REQUIRED = ['name', 'price', 'productUrl', 'images'];
const FAMILY_MAP = {
  Red: 'red', Blue: 'blue', Green: 'green', Yellow: 'yellow',
  Pink: 'pink', Purple: 'purple', Orange: 'orange', Brown: 'earth',
  Gold: 'earth', Teal: 'teal', Grey: 'neutral', Black: 'neutral',
  White: 'neutral', Multicolor: 'multicolor'
};

const NEG = ['unstitched', 'lawn suit', 'kurta fabric', 'bedsheet'];

/**
 * Hard reject: names that clearly belong to another vertical. Jewelry collections on
 * shoe-first brands (e.g. Stylo) leak footwear, bags, and beauty items — the product
 * NAME is the reliable signal, so guard on it. Matched with word boundaries.
 */
const NON_JEWELRY_NAME = new RegExp(
  '\\b(' +
    // footwear
    'sandal|sandals|slipper|slippers|chappal|chappals|khussa|kolhapuri|peshawari|' +
    'heel|heels|pump|pumps|sneaker|sneakers|jogger|joggers|shoe|shoes|boot|boots|' +
    'loafer|loafers|mule|mules|wedge|wedges|court\\s*shoe|flip[-\\s]?flop|footwear|' +
    // bags & leather goods
    'bag|bags|clutch|purse|purses|wallet|backpack|tote|handbag|satchel|pouch|belt|belts|' +
    // apparel / textile
    'kurta|kurti|shirt|trouser|dupatta|shawl|stole|scarf|abaya|hijab|suit|saree|lehenga|' +
    // beauty / misc
    'perfume|fragrance|lipstick|makeup|nail\\s*polish|sunglass|sunglasses|watch|watches' +
  ')\\b',
  'i'
);

const TYPE_RULES = [
  { kw: ['jhumka', 'jhumki'], val: 'jhumka' },
  { kw: ['chandbali'], val: 'chandbali' },
  { kw: ['stud earring', 'studs'], val: 'stud' },
  { kw: ['hoop'], val: 'hoop' },
  { kw: ['earring', 'ear ring'], val: 'earring' },
  { kw: ['choker'], val: 'choker' },
  { kw: ['mala', 'long necklace'], val: 'mala' },
  { kw: ['pendant'], val: 'pendant-chain' },
  { kw: ['necklace'], val: 'necklace' },
  { kw: ['bangle set', 'bangles'], val: 'bangle-set' },
  { kw: ['bangle'], val: 'bangle' },
  { kw: ['bracelet', 'kada'], val: 'bracelet' },
  { kw: ['ring'], val: 'ring' },
  { kw: ['nose pin', 'nose ring', 'nath'], val: 'nath' },
  { kw: ['tikka', 'maang'], val: 'maang-tikka' },
  { kw: ['jhoomar'], val: 'jhoomar' },
  { kw: ['bridal set', 'jewelry set', 'jewellery set'], val: 'bridal-set' },
  { kw: ['anklet', 'payal'], val: 'anklet' },
  { kw: ['brooch'], val: 'brooch' },
  { kw: ['cufflink'], val: 'cufflinks' }
];

function escapeRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Type detection on the NAME first (reliable), then description/tags. Word-boundary
 * matching so "ring" no longer matches inside "earring"/"during"/"spring".
 */
function inferJewelryType(name, blob) {
  for (const source of [name, blob]) {
    for (const { kw, val } of TYPE_RULES) {
      if (kw.some((k) => new RegExp(`\\b${escapeRx(k)}`, 'i').test(source))) return val;
    }
  }
  return 'other';
}

function jewelryCategoryFrom(type) {
  if (/earring|stud|hoop|jhumka|chandbali/.test(type)) return 'ear';
  if (/necklace|choker|mala|pendant/.test(type)) return 'neck';
  if (/bangle|bracelet|kada/.test(type)) return 'wrist';
  if (/ring|cufflink/.test(type)) return 'hand';
  if (/nath|tikka|jhoomar/.test(type)) return 'head';
  if (/bridal-set|set/.test(type)) return 'bridal-set';
  return 'other';
}

export function normalizeJewelryProduct(raw, brandConfig) {
  if (!raw || !brandConfig) return null;
  const name = (raw.title || raw.name || '').trim();
  if (!name || name.length < 2) return null;
  // Reject non-jewelry that leaks in from mixed-catalog collections (name is authoritative).
  if (NON_JEWELRY_NAME.test(name)) return null;
  const blob = [name, raw.description || '', ...(raw.tags || [])].join(' ').toLowerCase();
  if (NEG.some((n) => blob.includes(n))) return null;

  const price = raw.price;
  if (!price || price <= 0) return null;
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  if (raw.imageUrl && !images.includes(raw.imageUrl)) images.unshift(raw.imageUrl);
  if (images.length === 0) return null;
  const productUrl = (raw.productUrl || '').trim();
  if (!productUrl.startsWith('http')) return null;

  const { primaryColor, colors, primaryExactColor, exactColors } = inferColors(blob);
  const colorFamily = FAMILY_MAP[primaryColor] || 'multicolor';

  const jewelryType = inferJewelryType(name.toLowerCase(), blob);
  const jewelryCategory = jewelryCategoryFrom(jewelryType);

  const gender =
    brandConfig.gender ||
    (/\bmen\b|\bgents\b/.test(blob) ? 'men' : /\bkids\b/.test(blob) ? 'kids' : 'women');

  return {
    name: name.slice(0, 220),
    brand: brandConfig.brand,
    category: 'jewelry',
    jewelryType,
    jewelryCategory,
    metalFinish: /silver|925|sterling/.test(blob) ? 'silver' : /rose gold/.test(blob) ? 'rose-gold-plated' : 'gold-plated',
    stoneWork: /kundan|polki/.test(blob) ? 'kundan' : /pearl/.test(blob) ? 'pearls' : /meenakari/.test(blob) ? 'meenakari' : /cz|cubic zircon/.test(blob) ? 'cz' : 'none',
    setPieceCount: /\bset of (\d+)/.test(blob) ? parseInt(RegExp.$1, 10) : undefined,
    gender,
    occasion: brandConfig.occasion?.length ? [...brandConfig.occasion] : ['party'],
    season: ['all-season'],
    colors,
    primaryColor,
    exactColors,
    primaryExactColor,
    colorFamily,
    price,
    compareAtPrice: raw.compareAtPrice,
    currency: 'PKR',
    images,
    imageUrl: images[0],
    description: (raw.description || '').slice(0, 4000),
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 40) : [],
    style: brandConfig.style || [],
    trendTags: [],
    productUrl,
    source: brandConfig.source || brandConfig.brand,
    handle: raw.handle,
    aiEnriched: false,
    metadataScore: 0.55
  };
}

export function validateJewelryProduct(p) {
  if (!p) return { valid: false, reason: 'null' };
  for (const f of REQUIRED) {
    if (!p[f] || (Array.isArray(p[f]) && !p[f].length)) return { valid: false, reason: `missing: ${f}` };
  }
  if (p.price <= 0) return { valid: false, reason: 'invalid price' };
  return { valid: true };
}

export function needsJewelryAi(p) {
  return p.jewelryType === 'other' || (p.metadataScore ?? 0) < 0.48;
}

export const JEWELRY_ADAPTER_HOOKS = {
  normalizeProduct: normalizeJewelryProduct,
  validateProduct: validateJewelryProduct,
  enrichProduct: enrichJewelryProduct,
  needsAiRefinement: needsJewelryAi,
  vertical: 'jewelry'
};
