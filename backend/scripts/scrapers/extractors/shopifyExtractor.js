/**
 * shopifyExtractor.js
 * Extracts product data using Shopify's public JSON APIs.
 *
 * Strategy 1: /collections/<handle>/products.json  (collection-specific)
 * Strategy 2: /products.json                        (site-wide, filtered by keywords)
 *
 * Both support automatic pagination via page parameter.
 */

import { safeGet, politeSleep, withRetry } from '../utils/requestUtils.js';
import logger from '../utils/logger.js';

const DEFAULT_LIMIT = 250; // Shopify max per page

// ─── Build URLs ───────────────────────────────────────────────────────────────

export function buildCollectionJsonUrl(collectionUrl, limit = DEFAULT_LIMIT, page = 1) {
  try {
    const u = new URL(collectionUrl);
    const normalizedPath = u.pathname.replace(/\/$/, '');
    u.pathname = `${normalizedPath}/products.json`;
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('page', String(page));
    return u.toString();
  } catch {
    return null;
  }
}

export function buildSiteProductsJsonUrl(anyUrl, limit = DEFAULT_LIMIT, page = 1) {
  try {
    const baseOrigin = new URL(anyUrl).origin;
    const u = new URL(`${baseOrigin}/products.json`);
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('page', String(page));
    return u.toString();
  } catch {
    return null;
  }
}

// ─── Raw product fetcher ──────────────────────────────────────────────────────

async function fetchShopifyPage(url) {
  try {
    const res = await withRetry(() =>
      safeGet(url, {
        extraHeaders: { Accept: 'application/json' },
        responseType: 'json'
      })
    );
    const products = res.data?.products;
    return Array.isArray(products) ? products : [];
  } catch (err) {
    logger.warn(`Shopify fetch failed: ${url}`, err.message);
    return [];
  }
}

// ─── Strategy 1: Collection-specific ─────────────────────────────────────────

/**
 * Fetches all products from a Shopify collection JSON endpoint.
 * Paginates automatically until no more results.
 * @returns { products: [], strategy: 'shopify-collection' | 'failed' }
 */
export async function extractFromShopifyCollection(collectionUrl, maxItems = 250) {
  if (!collectionUrl.includes('/collections/')) {
    return { products: [], strategy: 'failed' };
  }

  let page = 1;
  const allProducts = [];

  while (allProducts.length < maxItems) {
    const url = buildCollectionJsonUrl(collectionUrl, DEFAULT_LIMIT, page);
    if (!url) break;

    const batch = await fetchShopifyPage(url);
    if (batch.length === 0) break;

    allProducts.push(...batch);
    if (batch.length < DEFAULT_LIMIT) break; // Last page
    page++;
    await politeSleep(800);
  }

  if (allProducts.length === 0) return { products: [], strategy: 'failed' };

  logger.info(`Shopify collection: ${allProducts.length} raw products from ${collectionUrl}`);
  return { products: allProducts.slice(0, maxItems), strategy: 'shopify-collection' };
}

// ─── Strategy 2: Site-wide /products.json with keyword filter ────────────────

/**
 * Fetches from /products.json and filters by keywords (tags, title, type).
 */
export async function extractFromShopifyAll(anyUrl, maxItems = 250, keywords = []) {
  const url = buildSiteProductsJsonUrl(anyUrl);
  if (!url) return { products: [], strategy: 'failed' };

  const batch = await fetchShopifyPage(url);
  if (batch.length === 0) return { products: [], strategy: 'failed' };

  const filtered = keywords.length > 0
    ? batch.filter((p) => matchesKeywords(p, keywords))
    : batch;

  if (filtered.length === 0) return { products: [], strategy: 'failed' };

  logger.info(`Shopify /products.json: ${filtered.length} filtered products from ${anyUrl}`);
  return { products: filtered.slice(0, maxItems), strategy: 'shopify-all' };
}

// ─── Keyword matcher ──────────────────────────────────────────────────────────

function matchesKeywords(product, keywords) {
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

// ─── Raw product → normalized fields ─────────────────────────────────────────

/**
 * Maps a raw Shopify product object to our intermediate normalized form.
 * Returns null if required fields are missing.
 */
export function mapShopifyProduct(rawProduct, baseOrigin) {
  const title = (rawProduct?.title || '').trim();
  const handle = rawProduct?.handle;
  if (!title || !handle) return null;

  // Images: prefer first image src
  const images = (rawProduct?.images || [])
    .map((img) => normalizeImageUrl(img?.src, baseOrigin))
    .filter(Boolean);

  // Also include feature_image if images array is empty
  if (images.length === 0 && rawProduct?.image?.src) {
    const img = normalizeImageUrl(rawProduct.image.src, baseOrigin);
    if (img) images.push(img);
  }

  // Price from first variant
  const priceRaw = rawProduct?.variants?.[0]?.price;
  const compareAtPriceRaw = rawProduct?.variants?.[0]?.compare_at_price;
  const price = parsePrice(priceRaw);
  const compareAtPrice = parsePrice(compareAtPriceRaw);

  const productUrl = `${baseOrigin}/products/${handle}`;

  // Sizes from variants
  const sizes = (rawProduct?.variants || [])
    .map((v) => v?.option1 || v?.title)
    .filter((s) => s && s.toLowerCase() !== 'default title')
    .slice(0, 20);

  // Tags
  const tags = Array.isArray(rawProduct?.tags)
    ? rawProduct.tags
    : typeof rawProduct?.tags === 'string'
    ? rawProduct.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  return {
    title,
    handle,
    images,
    price,
    compareAtPrice,
    productUrl,
    sizes,
    tags,
    description: stripHtml(rawProduct?.body_html || ''),
    vendor: rawProduct?.vendor,
    productType: rawProduct?.product_type,
    rawTags: tags
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeImageUrl(src, baseOrigin) {
  if (!src) return null;
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('http')) return src;
  if (baseOrigin) return `${baseOrigin}${src.startsWith('/') ? '' : '/'}${src}`;
  return null;
}

function parsePrice(value) {
  if (value === undefined || value === null) return null;
  const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
  if (!isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
}
