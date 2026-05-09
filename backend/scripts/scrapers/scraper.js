import * as cheerio from 'cheerio';
import connectDB from '../../config/db.js';
import Product from '../../models/Product.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

function loadEnv() {
  // Prefer backend-local env (DB/JWT), but also allow frontend env for shared keys.
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../../frontend/.env.local') });
}

function inferColor(title) {
  const t = title.toLowerCase();
  if (t.includes('red') || t.includes('maroon') || t.includes('rust')) return 'Red';
  if (t.includes('blue') || t.includes('nav')) return 'Blue';
  if (t.includes('green') || t.includes('mint') || t.includes('olive') || t.includes('emerald')) return 'Green';
  if (t.includes('black')) return 'Black';
  if (t.includes('white') || t.includes('off white') || t.includes('ivory')) return 'White';
  if (t.includes('yellow') || t.includes('mustard')) return 'Yellow';
  if (t.includes('pink') || t.includes('peach') || t.includes('tea pink')) return 'Pink';
  if (t.includes('gold') || t.includes('fawn') || t.includes('beige')) return 'Gold';
  if (t.includes('grey') || t.includes('gray') || t.includes('silver')) return 'Grey';
  return 'Multicolor';
}

function parseShopifyPriceToNumber(price) {
  if (price === undefined || price === null) return null;
  const numeric = String(price).replace(/[^0-9.]/g, '');
  if (!numeric) return null;
  const floatVal = Number.parseFloat(numeric);
  if (!Number.isFinite(floatVal)) return null;
  // Prices are PKR-ish integers in UI; keep simple.
  return Math.round(floatVal);
}

function normalizeUrlToAbsolute(url, baseOrigin) {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (!baseOrigin) return url;
  return `${baseOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function buildShopifyCollectionProductsJsonUrl(collectionUrl, limit = 50, page = 1) {
  const u = new URL(collectionUrl);
  const normalizedPath = u.pathname.replace(/\/$/, '');
  u.pathname = `${normalizedPath}/products.json`;
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('page', String(page));
  return u.toString();
}

export function buildShopifyAllProductsJsonUrl(anyUrl, limit = 50, page = 1) {
  const baseOrigin = new URL(anyUrl).origin;
  const u = new URL(`${baseOrigin}/products.json`);
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('page', String(page));
  return u.toString();
}

export function normalizeShopifyProduct(product, baseOrigin, brandName, category, occasionList, styleList) {
  const title = (product?.title || '').trim();
  const handle = product?.handle;

  const imageUrl =
    product?.images?.[0]?.src ||
    product?.image?.src ||
    product?.images?.[0] ||
    null;

  const price =
    parseShopifyPriceToNumber(product?.variants?.[0]?.price) ??
    parseShopifyPriceToNumber(product?.variants?.[0]?.compare_at_price) ??
    null;

  const absoluteImageUrl = normalizeUrlToAbsolute(imageUrl, baseOrigin);
  const productUrl = handle ? `${baseOrigin}/products/${handle}` : null;

  if (!title || !absoluteImageUrl || !productUrl) return null;
  if (price === null) return null;
  return {
    title: title.substring(0, 60),
    brand: brandName,
    price,
    category,
    imageUrl: absoluteImageUrl,
    productUrl,
    color: inferColor(title),
    occasion: occasionList,
    style: styleList
  };
}

async function tryScrapeShopifyCollection(collectionUrl, brandName, category, occasionList, styleList, maxItems) {
  // Many target sites are Shopify-based. Even when the collection page returns 404,
  // the `/products.json` endpoint often still works.
  if (!collectionUrl.includes('/collections/')) return [];

  const baseOrigin = new URL(collectionUrl).origin;
  const endpoint = buildShopifyCollectionProductsJsonUrl(collectionUrl, Math.min(250, Math.max(1, maxItems)), 1);

  const res = await fetch(endpoint, { headers: DEFAULT_HEADERS, redirect: 'follow' });
  if (!res.ok) return [];
  const data = await res.json();
  const arr = Array.isArray(data?.products) ? data.products : [];
  if (arr.length === 0) return [];

  const out = [];
  for (const p of arr) {
    if (out.length >= maxItems) break;
    const normalized = normalizeShopifyProduct(p, baseOrigin, brandName, category, occasionList, styleList);
    if (normalized) out.push(normalized);
  }
  return out;
}

function productMatchesKeywords(product, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return true;
  const blob = [
    product?.title,
    product?.product_type,
    product?.vendor,
    Array.isArray(product?.tags) ? product.tags.join(' ') : product?.tags,
    product?.handle
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return keywords.some((k) => blob.includes(String(k).toLowerCase()));
}

async function tryScrapeShopifyAllProducts(anyUrl, brandName, category, occasionList, styleList, maxItems, keywords) {
  const endpoint = buildShopifyAllProductsJsonUrl(anyUrl, Math.min(250, Math.max(1, maxItems)), 1);
  const baseOrigin = new URL(anyUrl).origin;

  const res = await fetch(endpoint, { headers: DEFAULT_HEADERS, redirect: 'follow' });
  if (!res.ok) return [];
  const data = await res.json();
  const arr = Array.isArray(data?.products) ? data.products : [];
  if (arr.length === 0) return [];

  const out = [];
  for (const p of arr) {
    if (out.length >= maxItems) break;
    if (!productMatchesKeywords(p, keywords)) continue;
    const normalized = normalizeShopifyProduct(p, baseOrigin, brandName, category, occasionList, styleList);
    if (normalized) out.push(normalized);
  }
  return out;
}

async function scrapeBrand(url, brandName, category, occasionList, styleList, shopifyKeywords) {
  console.log(`Scraping ${brandName} (${category})...`);
  try {
    const maxItems = Number.parseInt(process.env.SCRAPER_MAX_PER_BRAND || '25', 10) || 25;
    const shopifyItems = await tryScrapeShopifyCollection(url, brandName, category, occasionList, styleList, maxItems);
    if (shopifyItems.length > 0) {
      console.log(` -> Found ${shopifyItems.length} items from ${brandName} (Shopify JSON)`);
      return shopifyItems;
    }

    const shopifyAll = await tryScrapeShopifyAllProducts(
      url,
      brandName,
      category,
      occasionList,
      styleList,
      maxItems,
      shopifyKeywords
    );
    if (shopifyAll.length > 0) {
      const note = Array.isArray(shopifyKeywords) && shopifyKeywords.length > 0 ? ' (filtered)' : '';
      console.log(` -> Found ${shopifyAll.length} items from ${brandName} (Shopify /products.json${note})`);
      return shopifyAll;
    }

    const res = await fetch(url, { headers: DEFAULT_HEADERS, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const products = [];

    // Generic Modern E-Commerce DOM Selectors (Shopify/Magento)
    const itemSelector =
      '.product-item, .product-item-info, .grid__item, .product-card, li.item.product, .grid-view-item, .card, .product, .product-grid-item';
    
    $(itemSelector).each((i, el) => {
      if (products.length >= maxItems) return; // Cap maximum entries per brand visually
      
      const title = $(el)
        .find('.product-item__title, .title, .product-item-link, .h4, .product-title, a, .card__heading')
        .first()
        .text()
        .trim()
        .split('\n')[0];
      if (!title || title.length < 4) return;

      const priceStr = $(el).find('.price, .money, .sales').first().text().replace(/[^0-9]/g, '');
      const price = priceStr ? parseInt(priceStr.substring(0, 5)) : null;

      let imgEl = $(el).find('img').first();
      let imageUrl = imgEl.attr('data-src') || imgEl.attr('src') || imgEl.attr('data-srcset')?.split(' ')[0] || $(el).find('.product-image-photo').attr('src');
      if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
      if (imageUrl && imageUrl.includes('{width}')) imageUrl = imageUrl.replace('{width}', '600');
      
      let productUrl = $(el).find('a').first().attr('href');
      if (productUrl && !productUrl.startsWith('http')) {
         const baseUrl = new URL(url).origin;
         productUrl = baseUrl + productUrl;
      }

      if (imageUrl && productUrl && imageUrl.includes('http') && Number.isFinite(price)) {
        products.push({
          title: title.substring(0, 60),
          brand: brandName,
          price,
          category,
          imageUrl,
          productUrl,
          color: inferColor(title),
          occasion: occasionList,
          style: styleList
        });
      }
    });

    console.log(` -> Found ${products.length} items from ${brandName}`);
    return products;
  } catch (err) {
    console.error(` -> ${brandName} fetch failed:`, err.message);
    return [];
  }
}

export async function runScraper() {
  loadEnv();
  console.log('Starting Universal Aggregator Scraper to seed Database...');

  const dryRun = String(process.env.SCRAPER_DRY_RUN || '').toLowerCase() === 'true';

  if (!dryRun) {
    await connectDB();
  }

  // Validate reset
  if (!dryRun) {
    await Product.deleteMany({});
  }
  console.log('Cleared DB prior history. Fetching brand catalogues dynamically...');

  // Keep scraping to 5 Pakistani brands only.
  const targets = [
    { url: 'https://www.junaidjamshed.com/collections/womens-kurti', brand: 'J. (Junaid Jamshed)', category: 'Dress', occasion: ['casual', 'office', 'eid'], style: ['minimal'], shopifyKeywords: ['kurti', 'kurta'] },
    { url: 'https://www.limelight.pk/collections/pret', brand: 'Limelight', category: 'Dress', occasion: ['party', 'casual', 'trendy'], style: ['trendy', 'elegant'] },
    { url: 'https://zeenwoman.com/collections/ready-to-wear', brand: 'Zeen', category: 'Dress', occasion: ['formal', 'office', 'wedding'], style: ['elegant', 'minimal'] },
    { url: 'https://ethnic.pk/collections/pret', brand: 'Ethnic', category: 'Dress', occasion: ['casual', 'party', 'mehndi'], style: ['heavy', 'trendy'] },
    { url: 'https://stylo.pk/collections/shoes', brand: 'Stylo', category: 'Shoe', occasion: ['wedding', 'party', 'mehndi'], style: ['elegant'] }
  ];

  let allProducts = [];

  for (const t of targets) {
    const items = await scrapeBrand(t.url, t.brand, t.category, t.occasion, t.style, t.shopifyKeywords);
    allProducts = allProducts.concat(items);
  }

  console.log(`Aggregated ${allProducts.length} items for database upsert...`);
  
  if (!dryRun) {
    for (const item of allProducts) {
      if (item.category && item.title) {
        await Product.findOneAndUpdate({ productUrl: item.productUrl }, item, { upsert: true, new: true });
      }
    }
  }

  if (dryRun) {
    console.log('Dry run complete (no DB writes).');
    return;
  }

  console.log('Scraping and DB population complete.');
  process.exit(0);
}

export { inferColor };

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  runScraper().catch((e) => {
    console.error('Scraper failed:', e);
    process.exit(1);
  });
}
