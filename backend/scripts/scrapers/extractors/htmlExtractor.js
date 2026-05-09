/**
 * htmlExtractor.js
 * Cheerio-based HTML fallback extractor for non-Shopify or blocked sites.
 * Uses a broad set of CSS selectors compatible with common e-commerce themes.
 */

import * as cheerio from 'cheerio';
import { safeGet, withRetry, politeSleep } from '../utils/requestUtils.js';
import logger from '../utils/logger.js';

// ─── Selector sets (ordered by specificity) ───────────────────────────────────

const PRODUCT_CONTAINER_SELECTORS = [
  '.product-item',
  '.product-card',
  '.grid__item',
  '.product-grid-item',
  'li.item.product',
  '.grid-view-item',
  '.product',
  '[data-product-id]',
  '.card--product'
];

const TITLE_SELECTORS = [
  '.product-item__title',
  '.product-title',
  '.card__heading a',
  '.product-item-link',
  'h2 a',
  'h3 a',
  '.title a',
  'a.product-name',
  '.name'
];

const PRICE_SELECTORS = [
  '.price--sale .money',
  '.price .money',
  '.price-item--sale',
  '.price-item--regular',
  '.price',
  '.money',
  '[class*="price"]'
];

const IMAGE_SELECTORS = [
  'img[data-src]',
  'img[src*="cdn.shopify"]',
  'img[src*="product"]',
  'img.product-image',
  '.product-image-photo',
  'img'
];

const LINK_SELECTORS = ['a.product-item__link', 'a[href*="/products/"]', 'h2 a', 'h3 a', '.card__heading a', 'a'];

// ─── Main extractor ───────────────────────────────────────────────────────────

/**
 * Extracts product data from an HTML page using Cheerio.
 * @param {string} pageUrl - Full URL of the collection/category page
 * @param {number} maxItems - Maximum items to extract
 * @returns {{ products: [], strategy: 'html' | 'failed' }}
 */
export async function extractFromHtml(pageUrl, maxItems = 50) {
  let html;
  try {
    const res = await withRetry(() => safeGet(pageUrl, { responseType: 'text', timeout: 20000 }));
    html = typeof res.data === 'string' ? res.data : null;
  } catch (err) {
    logger.warn(`HTML fetch failed: ${pageUrl}`, err.message);
    return { products: [], strategy: 'failed' };
  }

  if (!html) return { products: [], strategy: 'failed' };

  const $ = cheerio.load(html);
  const baseOrigin = new URL(pageUrl).origin;
  const products = [];

  // Try each container selector
  for (const containerSel of PRODUCT_CONTAINER_SELECTORS) {
    const containers = $(containerSel);
    if (containers.length < 2) continue; // Skip unlikely matches

    containers.each((_, el) => {
      if (products.length >= maxItems) return;

      const title = extractText($, el, TITLE_SELECTORS);
      if (!title || title.length < 3) return;

      const priceText = extractText($, el, PRICE_SELECTORS);
      const price = parseHtmlPrice(priceText);

      const imageUrl = extractImage($, el, IMAGE_SELECTORS, baseOrigin);
      const productUrl = extractLink($, el, LINK_SELECTORS, baseOrigin);

      // Validation: must have image and valid URL
      if (!imageUrl || !productUrl || !productUrl.includes('/products/')) return;

      products.push({
        title: title.trim().slice(0, 200),
        price,
        images: imageUrl ? [imageUrl] : [],
        productUrl,
        tags: [],
        sizes: [],
        description: ''
      });
    });

    if (products.length > 0) break; // Found results, stop trying selectors
  }

  if (products.length === 0) {
    logger.warn(`HTML extractor found 0 products on: ${pageUrl}`);
    return { products: [], strategy: 'failed' };
  }

  logger.info(`HTML extractor: ${products.length} products from ${pageUrl}`);
  return { products, strategy: 'html' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText($, el, selectors) {
  for (const sel of selectors) {
    const text = $(el).find(sel).first().text().trim();
    if (text && text.length > 2) return text.split('\n')[0].trim();
  }
  return '';
}

function extractImage($, el, selectors, baseOrigin) {
  for (const sel of selectors) {
    const imgEl = $(el).find(sel).first();
    if (!imgEl.length) continue;

    const src =
      imgEl.attr('data-src') ||
      imgEl.attr('data-srcset')?.split(' ')[0] ||
      imgEl.attr('srcset')?.split(' ')[0] ||
      imgEl.attr('src');

    if (!src || src.includes('placeholder') || src.includes('blank')) continue;

    let url = src;
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.includes('{width}')) url = url.replace('{width}', '600');
    if (!url.startsWith('http') && baseOrigin) url = `${baseOrigin}${url}`;

    if (url.startsWith('http')) return url;
  }
  return null;
}

function extractLink($, el, selectors, baseOrigin) {
  for (const sel of selectors) {
    const href = $(el).find(sel).first().attr('href') || $(el).closest('a').attr('href');
    if (!href) continue;
    if (href.startsWith('http')) return href;
    if (href.startsWith('/')) return `${baseOrigin}${href}`;
  }
  return null;
}

function parseHtmlPrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned.slice(0, 8)); // Cap at 8 digits
  if (!isFinite(num) || num <= 0) return null;
  return Math.round(num);
}
