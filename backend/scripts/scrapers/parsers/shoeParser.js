/**
 * shoeParser.js — ShoeProduct normalizer from Shopify-mapped raw.
 */
import { inferColors } from '../utils/colorInference.js';

const REQUIRED = ['name', 'price', 'productUrl', 'images'];

const FAMILY_MAP = {
  Red: 'red', Blue: 'blue', Green: 'green', Yellow: 'yellow',
  Pink: 'pink', Purple: 'purple', Orange: 'orange', Brown: 'earth',
  Gold: 'earth', Beige: 'earth', Teal: 'teal', Grey: 'neutral', Black: 'neutral',
  White: 'neutral', Multicolor: 'multicolor'
};

const SHOE_NEGATIVE = [
  'unstitched', 'lawn suit', '3-piece suit', '2-piece suit', 'kameez', 'dupatta',
  'bedsheet', 'fabric only', 'kurta only', 'shirt only', 'trouser fabric',
  'perfume', 'handbag', 'wallet', 'clutch bag'
];

const SHOE_TYPE_RULES = [
  { kw: ['khussa', 'khussay', 'khusa'], val: 'khussa' },
  { kw: ['kohati', 'kohati chappal'], val: 'kohati' },
  { kw: ['kolhapuri'], val: 'kolhapuri' },
  { kw: ['peshawari', 'charsadda'], val: 'peshawari' },
  { kw: ['stiletto'], val: 'stiletto' },
  { kw: ['block heel', 'block-heel'], val: 'block-heel' },
  { kw: ['wedge'], val: 'wedge' },
  { kw: ['platform'], val: 'platform' },
  { kw: ['pump', 'court shoe'], val: 'pump' },
  { kw: ['heel', 'high heel'], val: 'heel' },
  { kw: ['sneaker', 'trainer', 'jogger', 'running shoe'], val: 'sneaker' },
  { kw: ['loafer'], val: 'loafer' },
  { kw: ['moccasin'], val: 'moccasin' },
  { kw: ['oxford'], val: 'oxford' },
  { kw: ['monk strap', 'monk-strap'], val: 'monk-strap' },
  { kw: ['ballet flat', 'ballet-flat', 'ballerina'], val: 'ballet-flat' },
  { kw: ['mule'], val: 'mule' },
  { kw: ['slide', 'slider'], val: 'slide' },
  { kw: ['flip flop', 'flip-flop', 'chappal', 'chapal'], val: 'flip-flop' },
  { kw: ['slipper', 'house slipper'], val: 'slipper' },
  { kw: ['sandal'], val: 'sandal' },
  { kw: ['chelsea boot', 'chelsea'], val: 'chelsea-boot' },
  { kw: ['ankle boot', 'ankle-boot'], val: 'ankle-boot' },
  { kw: ['combat boot'], val: 'combat' },
  { kw: ['long boot', 'knee high'], val: 'long-boot' },
  { kw: ['boot'], val: 'boot' },
  { kw: ['school shoe'], val: 'school-shoe' },
  { kw: ['bridal shoe', 'bridal heel'], val: 'bridal-footwear' },
  { kw: ['formal shoe', 'dress shoe'], val: 'formal-dress' },
  { kw: ['espadrille'], val: 'espadrille' },
  { kw: ['boat shoe'], val: 'boat-shoe' },
  { kw: ['clog'], val: 'clogs' },
  { kw: ['flat shoe', 'ballet flat', 'ballerina'], val: 'flat' }
];

// Default silhouette for each merchandising bucket — used only when the product's
// own title/tags carry no silhouette word.
const BUCKET_DEFAULT_TYPE = {
  heels: 'heel', flats: 'flat', sandals: 'sandal', khussa: 'khussa',
  sneakers: 'sneaker', boots: 'boot', mules: 'mule', formal: 'formal-dress',
  casual: 'flat', athletic: 'sneaker', ethnic: 'khussa', other: 'other'
};

/**
 * Infer the silhouette from the product's OWN clean text (title + tags), which is
 * reliable regardless of which collection the product was fetched from. Falls back
 * to the collection bucket default only when the text carries no silhouette word.
 * (Description is intentionally excluded — copy like "flat comfortable insole" on a
 * heel used to corrupt the type.)
 */
function scanShoeType(txt) {
  for (const { kw, val } of SHOE_TYPE_RULES) {
    if (kw.some((k) => txt.includes(k))) return val;
  }
  return null;
}

/**
 * Title-first: the silhouette noun in the product NAME (e.g. "Formal Sandal",
 * "Court Shoes", "Slipper") is the true type and must win over a tag/description
 * attribute like "wedge"/"heel". Tags are only a fallback; then the collection
 * bucket default.
 */
function inferShoeType(titleLc, tagsLc, configSub) {
  return scanShoeType(titleLc) || scanShoeType(tagsLc) || BUCKET_DEFAULT_TYPE[configSub] || 'other';
}

const GT_WOMEN = /\b(women|womens|women's|ladies|female)\b/;
const GT_MEN   = /\b(men|mens|men's|gents|gentlemen|male)\b/;
const GT_KIDS  = /\b(kids|kid's|child|children|junior|toddler|infant|girls?|boys?|baby)\b/;

function inferGenderShoe(nameLc, tags, brandGender) {
  // 1. The NAME is the most reliable signal.
  const nameWomen = GT_WOMEN.test(nameLc);
  if (GT_MEN.test(nameLc) && !nameWomen) return 'men';
  if (GT_KIDS.test(nameLc) && !nameWomen) return 'kids';

  // 2. CLEAN (digit-free) tags are real category tags ("Men Slippers", "Kids
  //    Shoes", "Girls Footwear"). Tags containing digits are merchandising codes
  //    ("B20-Girl B", "BW11340") and their gender words are meaningless — ignore.
  const cleanTags = (Array.isArray(tags) ? tags : [])
    .filter((t) => !/\d/.test(t) && !/size|chart|guide|care|wash|dhldes|desc/i.test(t))
    .join(' ').toLowerCase();
  const tagWomen = GT_WOMEN.test(cleanTags);
  if (GT_MEN.test(cleanTags) && !tagWomen) return 'men';
  if (GT_KIDS.test(cleanTags) && !tagWomen) return 'kids';

  // 3. Collection default, then any women signal, then default.
  if (brandGender && ['women', 'men', 'kids', 'unisex'].includes(brandGender)) return brandGender;
  if (nameWomen || tagWomen) return 'women';
  return 'women';
}

function inferOccasionShoe(blob, configOcc) {
  const o = new Set(configOcc || []);
  if (/bridal|wedding|nikah|barat/.test(blob)) { o.add('wedding'); o.add('bridal'); }
  if (/eid|festive/.test(blob)) o.add('eid');
  if (/mehndi|mayun|haldi/.test(blob)) o.add('mehndi');
  if (/formal|office|work/.test(blob)) { o.add('formal'); o.add('office'); }
  if (/party|evening/.test(blob)) o.add('party');
  if (/sport|gym|run|training/.test(blob)) o.add('casual');
  if (o.size === 0) o.add('casual');
  return [...o];
}

function inferSeason(blob) {
  const s = [];
  if (/summer|lawn|open toe|breathable/.test(blob)) s.push('summer');
  if (/winter|warm|lined|boot/.test(blob)) s.push('winter');
  if (s.length === 0) s.push('all-season');
  return s;
}

function inferHeelHeight(blob) {
  if (/flat|no heel|0 heel|ballet/.test(blob)) return 'flat';
  if (/platform|wedge/.test(blob)) return 'platform';
  if (/high heel|stiletto|4 inch|10\s*cm|12\s*cm/.test(blob)) return 'high';
  if (/mid heel|kitten|2 inch|5\s*cm|6\s*cm/.test(blob)) return 'mid';
  if (/low heel|1 inch|3\s*cm/.test(blob)) return 'low';
  return 'unknown';
}

function inferClosure(blob) {
  // Specific mechanisms first. A bare "strap" is NOT a buckle — slingback, ankle,
  // and mary-jane straps often close with velcro/elastic — so only a real
  // "buckle" maps to buckle, and slip-on/velcro/elastic are detected explicitly.
  if (/hook[-\s]?and[-\s]?loop|hook\s*&\s*loop|velcro/.test(blob)) return 'velcro';
  if (/lace[-\s]?up|laces|lacing/.test(blob)) return 'lace-up';
  if (/zipper|\bzip\b/.test(blob)) return 'zip';
  // An explicit "slip-on" statement is authoritative — a decorative "buckle"
  // ornament on a slip-on shoe must not label it a buckle closure.
  if (/slip[-\s]?on|pull[-\s]?on/.test(blob)) return 'slip-on';
  if (/sling[-\s]?back|elastic|elasticated|elasticised/.test(blob)) return 'elastic';
  if (/\bbuckle/.test(blob)) return 'buckle';
  if (/\bmule\b|back open|back-open|moccasin|loafer|ballet|\bpump|court shoe|slipper|khussa|chappal|peshawari|kolhapuri/.test(blob)) return 'slip-on';
  return 'slip-on';
}

function computeMetaScore(p) {
  let s = 0;
  if (p.name) s += 0.15;
  if (p.price > 0) s += 0.1;
  if (p.images?.length) s += 0.1;
  if (p.shoeType && p.shoeType !== 'other') s += 0.15;
  if (p.occasion?.length) s += 0.1;
  if (p.description?.length > 20) s += 0.08;
  if (p.primaryColor) s += 0.08;
  if (p.sizes?.length) s += 0.1;
  if (p.gender) s += 0.05;
  if (p.upperMaterial) s += 0.05;
  return Math.min(1, parseFloat(s.toFixed(2)));
}

export function normalizeShoeProduct(raw, brandConfig) {
  if (!raw || !brandConfig) return null;
  const name = (raw.title || raw.name || '').trim();
  if (!name || name.length < 2) return null;

  const blob = [name, raw.description || '', ...(raw.tags || [])].join(' ').toLowerCase();
  // Clean signals for silhouette & gender: the product's own title and tags, no copy.
  const titleLc = name.toLowerCase();
  const tagsLc = (raw.tags || []).join(' ').toLowerCase();
  const cleanBlob = `${titleLc} ${tagsLc}`;
  if (SHOE_NEGATIVE.some((n) => blob.includes(n))) return null;

  const price = raw.price;
  if (!price || price <= 0) return null;

  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  if (raw.imageUrl && !images.includes(raw.imageUrl)) images.unshift(raw.imageUrl);
  if (images.length === 0) return null;

  const productUrl = (raw.productUrl || '').trim();
  if (!productUrl.startsWith('http')) return null;

  const subCategory = brandConfig.subCategory || 'other';
  const shoeType = inferShoeType(titleLc, tagsLc, subCategory);
  const gender = inferGenderShoe(titleLc, raw.tags || [], brandConfig.gender);
  // NOTE: women-only filtering happens in BaseAdapter (post-validation) so that
  // an intentionally-rejected men's/kids' item is not mistaken for a parse
  // failure and sent through the LLM repair path.

  // Colors — source-prioritized: variant color option & title over marketing copy.
  const { primaryColor, colors, primaryExactColor, exactColors } = inferColors({
    options: raw.variantOptions,
    title: name,
    tags: raw.tags,
    description: raw.description
  });
  const colorFamily = FAMILY_MAP[primaryColor] || 'multicolor';
  const occasion = inferOccasionShoe(blob, brandConfig.occasion);
  const season = inferSeason(blob);
  const sportUse = /\b(run|sport|gym|training|basketball|football|athletic)\b/.test(blob);

  const sizes = Array.isArray(raw.sizes) ? raw.sizes.slice(0, 24) : [];

  return {
    name: name.slice(0, 220),
    brand: brandConfig.brand,
    category: 'shoes',
    shoeType,
    subCategory,
    closure: inferClosure(blob),
    heelHeight: inferHeelHeight(blob),
    gender,
    occasion,
    season,
    sportUse,
    colors,
    primaryColor,
    exactColors,
    primaryExactColor,
    colorFamily,
    sizes,
    price,
    compareAtPrice: raw.compareAtPrice || undefined,
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
    metadataScore: computeMetaScore({
      name, price, images, shoeType, occasion, description: raw.description, primaryColor, sizes, gender
    })
  };
}

/** Public helper: derive gender from a shoe's name + tags (women-only QA). */
export function deriveShoeGender(name, tags) {
  return inferGenderShoe((name || '').toLowerCase(), tags || [], undefined);
}

/** Public helper: re-derive shoeType from a shoe's name + tags + subCategory. */
export function deriveShoeType(name, tags, subCategory) {
  const tagsLc = (tags || []).join(' ').toLowerCase();
  return inferShoeType((name || '').toLowerCase(), tagsLc, subCategory || 'other');
}

export function validateShoeProduct(p) {
  if (!p) return { valid: false, reason: 'null' };
  for (const f of REQUIRED) {
    if (!p[f] || (Array.isArray(p[f]) && p[f].length === 0)) {
      return { valid: false, reason: `missing: ${f}` };
    }
  }
  if (p.price <= 0) return { valid: false, reason: 'invalid price' };
  return { valid: true };
}

export function needsShoeAiRefinement(p) {
  return !p.shoeType || p.shoeType === 'other' || (p.metadataScore ?? 0) < 0.45;
}

import { enrichShoeProduct } from '../utils/accessoryEnricher.js';

export const SHOE_ADAPTER_HOOKS = {
  normalizeProduct: normalizeShoeProduct,
  validateProduct: validateShoeProduct,
  enrichProduct: enrichShoeProduct,
  needsAiRefinement: needsShoeAiRefinement,
  vertical: 'shoes'
};
