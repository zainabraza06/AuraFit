/**
 * Shopify JSON URL builders and lightweight product preview normalization
 * (used by unit tests and tooling; main clothing pipeline uses productParser).
 */

/** Rough title-only color family for Shopify preview payloads (tests only). */
export function inferColor(title) {
  const t = String(title || '').toLowerCase();
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
