/**
 * watchParser.js — WatchProduct from Shopify-mapped raw.
 */
import { inferColors } from '../utils/colorInference.js';
import { enrichWatchProduct } from '../utils/accessoryEnricher.js';

const REQUIRED = ['name', 'price', 'productUrl', 'images'];
const FAMILY_MAP = {
  Red: 'red', Blue: 'blue', Green: 'green', Yellow: 'yellow',
  Pink: 'pink', Purple: 'purple', Orange: 'orange', Brown: 'earth',
  Gold: 'earth', Teal: 'teal', Grey: 'neutral', Black: 'neutral',
  White: 'neutral', Multicolor: 'multicolor'
};

const NEG = ['unstitched', 'lawn suit', 'kurta', 'dupatta', 'bedsheet', 'perfume'];

function inferWatchType(blob) {
  if (/smart\s*watch|apple watch|wear os|bluetooth call/i.test(blob)) return 'smartwatch';
  if (/chronograph/.test(blob)) return 'chronograph';
  if (/digital|led display/.test(blob)) return 'digital';
  if (/couple|his and her|pair set/.test(blob)) return 'couple-set';
  if (/kids|children/.test(blob)) return 'kids';
  if (/diver|200m|100m water/.test(blob)) return 'diver-style';
  if (/minimal|slim profile/.test(blob)) return 'minimalist';
  if (/dress|formal watch/.test(blob)) return 'dress';
  if (/sport|chronograph|stopwatch/.test(blob)) return 'sports';
  return 'analog';
}

function inferStrap(blob) {
  if (/mesh|milanaise/.test(blob)) return 'mesh';
  if (/leather|calf|genuine leather/.test(blob)) return 'leather';
  if (/metal bracelet|stainless bracelet|steel band/.test(blob)) return 'metal-bracelet';
  if (/silicone|rubber strap/.test(blob)) return 'silicone';
  if (/nato|fabric strap/.test(blob)) return 'fabric';
  return 'other';
}

function inferMovement(blob) {
  if (/automatic|self-wind/.test(blob)) return 'automatic';
  if (/mechanical|hand wind/.test(blob)) return 'mechanical';
  if (/solar|eco-drive/i.test(blob)) return 'solar';
  if (/digital|module/.test(blob)) return 'digital-module';
  return 'quartz';
}

function inferWater(blob) {
  if (/200m|300m|20\s*atm|diver/.test(blob)) return '200m-plus';
  if (/100m|10\s*atm/.test(blob)) return '100m';
  if (/50m|5\s*atm/.test(blob)) return '50m';
  if (/30m|3\s*atm/.test(blob)) return '30m';
  if (/splash|water resist/i.test(blob)) return 'splash';
  return 'unknown';
}

export function normalizeWatchProduct(raw, brandConfig) {
  if (!raw || !brandConfig) return null;
  const name = (raw.title || raw.name || '').trim();
  if (!name || name.length < 2) return null;
  const blob = [name, raw.description || '', ...(raw.tags || [])].join(' ').toLowerCase();
  if (NEG.some((n) => blob.includes(n))) return null;
  if (isNonWatchName(name)) return null; // scarves/shoes/bags that leak into watch collections

  const price = raw.price;
  if (!price || price <= 0) return null;
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  if (raw.imageUrl && !images.includes(raw.imageUrl)) images.unshift(raw.imageUrl);
  if (images.length === 0) return null;
  const productUrl = (raw.productUrl || '').trim();
  if (!productUrl.startsWith('http')) return null;

  const { primaryColor, colors, primaryExactColor, exactColors } = inferColors(blob);
  const colorFamily = FAMILY_MAP[primaryColor] || 'multicolor';

  const gender =
    brandConfig.gender ||
    (/\bmen\b|\bmens\b|\bgents\b/.test(blob) ? 'men' : /\bkids\b/.test(blob) ? 'kids' : /\bwomen\b|\bladies\b/.test(blob) ? 'women' : 'unisex');

  return {
    name: name.slice(0, 220),
    brand: brandConfig.brand,
    category: 'watches',
    watchType: inferWatchType(blob),
    dialShape: /square|rectangular/.test(blob) ? 'square' : 'round',
    caseMaterial: /ceramic/.test(blob) ? 'ceramic' : /stainless|steel case/i.test(blob) ? 'stainless-steel' : 'alloy',
    strapType: inferStrap(blob),
    movement: inferMovement(blob),
    waterResistance: inferWater(blob),
    crystal: /sapphire/.test(blob) ? 'sapphire' : 'mineral',
    features: [],
    dialColor: undefined,
    gender,
    occasion: brandConfig.occasion?.length ? [...brandConfig.occasion] : ['casual'],
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

export function validateWatchProduct(p) {
  if (!p) return { valid: false, reason: 'null' };
  for (const f of REQUIRED) {
    if (!p[f] || (Array.isArray(p[f]) && !p[f].length)) return { valid: false, reason: `missing: ${f}` };
  }
  if (p.price <= 0) return { valid: false, reason: 'invalid price' };
  return { valid: true };
}

export function needsWatchAi(p) {
  return (p.metadataScore ?? 0) < 0.5;
}

export const WATCH_ADAPTER_HOOKS = {
  normalizeProduct: normalizeWatchProduct,
  validateProduct: validateWatchProduct,
  enrichProduct: enrichWatchProduct,
  needsAiRefinement: needsWatchAi,
  vertical: 'watches'
};

/**
 * Names that clearly belong to another vertical. Watch collections on multi-category retailers
 * (ECS, Limelight) leak scarves, shirts, shoes and bags. A POSITIVE rule is not possible here:
 * real ECS watches are named like "Structured Dial" or "Tonneau Roman" with no "watch" in them.
 */
const NON_WATCH_NAME = new RegExp(
  '\\b(' +
    'sandal|sandals|slipper|slippers|khussa|pump|pumps|sneaker|sneakers|shoe|shoes|boot|boots|loafer|loafers|mule|mules|wedge|wedges|footwear|' +
    'bag|bags|clutch|purse|wallet|backpack|tote|handbag|satchel|' +
    'scarf|scarves|shawl|stole|shirt|kurta|kurti|dupatta|suit|trouser|trousers|piece|pret|rtw|rts|khaddar|lawn|abaya|hijab|saree|lehenga|' +
    'kameez|shalwar|salwar|waistcoat|jacket|coat|frock|tunic|blouse|' +
    // seen leaking from a site-wide fallback (Limelight): tops, co-ords, knitwear, hosiery, slides, eyewear, jewelry
    'top|tops|cardigan|co[-\\s]?ord|coord|tights|slip[-\\s]?ons?|slides?|sunglass|sunglasses|hoop|hoops|bracelet|bracelets|' +
    'perfume|fragrance|lipstick|makeup|earring|earrings|necklace|bangle|bangles' +
  ')\\b',
  'i'
);

/** True when a product NAME is clearly not a watch. Used by the parser and the cleanup script. */
export function isNonWatchName(name) {
  return NON_WATCH_NAME.test(String(name || ''));
}
