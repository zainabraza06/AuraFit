/**
 * khaadiExtractor.js
 * pk.khaadi.com — Salesforce Commerce Cloud PLP tiles are server-rendered:
 * `div.product[data-pid]` + `data-gtmdata` JSON (name, category, price) and
 * PDP links like `/slug/PID.html`.
 */

import * as cheerio from 'cheerio';
import { safeGet, withRetry, politeSleep } from '../utils/requestUtils.js';
import { stripHtml } from '../utils/textClean.js';
import logger from '../utils/logger.js';

function originFromUrl(pageUrl) {
  try {
    return new URL(pageUrl).origin;
  } catch {
    return 'https://pk.khaadi.com';
  }
}

function absolutize(url, origin) {
  if (!url) return null;
  let u = String(url).replace(/&amp;/g, '&').trim();
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('http')) return u;
  if (u.startsWith('/')) return `${origin}${u}`;
  return null;
}

function stripQuery(href) {
  if (!href) return href;
  const q = href.indexOf('?');
  return q === -1 ? href : href.slice(0, q);
}

/**
 * Parse Khaadi category / listing HTML (already fetched).
 * @param {string} html
 * @param {string} pageUrl - used for origin when resolving relative URLs
 * @param {number} maxItems
 * @returns {Array<{ title: string, price: number, images: string[], productUrl: string, tags: string[], sizes: string[], description: string }>}
 */
export function parseKhaadiCategoryHtml(html, pageUrl, maxItems = 50) {
  const origin = originFromUrl(pageUrl);
  const $ = cheerio.load(html);
  const products = [];
  const seen = new Set();

  $('div.product[data-pid]').each((_, el) => {
    if (products.length >= maxItems) return false;

    const $el = $(el);
    let gtm = null;
    const gtmRaw = $el.attr('data-gtmdata');
    if (gtmRaw) {
      try {
        gtm = JSON.parse(gtmRaw);
      } catch {
        /* ignore malformed */
      }
    }

    const title = (gtm?.name || $el.find('h2.pdp-link-heading').first().text() || '').trim();
    if (!title || title.length < 3) return;

    let price = null;
    if (gtm?.price != null && String(gtm.price).trim() !== '') {
      const n = parseFloat(String(gtm.price).replace(/[^\d.]/g, ''));
      if (Number.isFinite(n) && n > 0) price = Math.round(n);
    }
    if (price == null) {
      const priceText = $el.find('.price').first().text();
      const n = parseFloat(priceText.replace(/[^\d.]/g, '').slice(0, 12));
      if (Number.isFinite(n) && n > 0) price = Math.round(n);
    }
    if (!price) return;

    const hrefRaw =
      $el.find('a.plpRedirectPdp[href]').first().attr('href') ||
      $el.find('a.link.plpRedirectPdp[href]').first().attr('href') ||
      '';
    if (!hrefRaw) return;

    let productUrl = absolutize(hrefRaw, origin);
    if (!productUrl || !productUrl.startsWith('http')) return;
    productUrl = stripQuery(productUrl);

    if (seen.has(productUrl)) return;
    seen.add(productUrl);

    const images = [];
    const $ic = $el.find('.image-container').first();
    for (let i = 0; i < 6; i++) {
      const v = $ic.attr(`data-large-${i}`);
      const u = absolutize(v, origin);
      if (u && u.startsWith('http') && !images.includes(u)) images.push(u);
    }
    if (images.length === 0) {
      const src =
        $el.find('img.tile-image').first().attr('src') ||
        $el.find('.plp-mobile-slide img').first().attr('src') ||
        $el.find('img[src*="demandware"], img[src*="khaadi"]').first().attr('src');
      const u = absolutize(src, origin);
      if (u && u.startsWith('http')) images.push(u);
    }
    if (images.length === 0) return;

    const tags = [];
    if (gtm?.category) tags.push(String(gtm.category));

    products.push({
      title: title.slice(0, 200),
      price,
      images,
      productUrl,
      tags,
      sizes: [],
      description: ''
    });
  });

  return products;
}

// ─── Product detail page ─────────────────────────────────────────────────────
// The listing tiles carry no description, stock or sizes, so these come from the PDP.

const REAL_SIZE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|d{2}|free size|one size)$/i;

/**
 * Parse a Khaadi product page.
 * - available: JSON-LD offers.availability is authoritative; the page's own
 *   "Item is currently Out of Stock" message is the fallback. undefined = unknown.
 * - description: the "description-and-detail" block (fabric lines + marketing copy).
 * - sizes: only real garment sizes. Khaadi's "size" widget mostly lists set
 *   variants like "3PC", which must not leak into size filters.
 * @returns {{ available: boolean|undefined, description: string, sizes: string[] }}
 */
export function parseKhaadiDetailHtml(html) {
  const $ = cheerio.load(html);

  let available;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).contents().text());
      const avail = String(ld?.offers?.availability || '');
      if (/InStock/i.test(avail)) available = true;
      else if (/OutOfStock|SoldOut/i.test(avail)) available = false;
    } catch { /* ignore malformed JSON-LD */ }
  });
  if (available === undefined) {
    const msg = $('.availability, .product-availability').first().text();
    if (/out of stock/i.test(msg)) available = false;
  }

  const description = stripHtml($('.description-and-detail').first().html() || '', 2000);

  const sizes = [];
  $('.size-item input').each((_, el) => {
    const label = ($(el).attr('id') || $(el).attr('data-attr-value') || '').trim();
    if (REAL_SIZE.test(label) && !sizes.includes(label.toUpperCase())) sizes.push(label.toUpperCase());
  });

  return { available, description, sizes };
}

/**
 * Fills description / sizes / availability on listing rows by reading each product page.
 * Polite (sequential, delayed). A failed page leaves that row as-is rather than dropping it.
 * Set KHAADI_DETAIL=false to skip (faster dry runs).
 */
export async function enrichKhaadiProducts(products, { delayMs = Number(process.env.SCRAPER_DELAY_MS ?? 1500) } = {}) {
  if (String(process.env.KHAADI_DETAIL || '').toLowerCase() === 'false') return products;
  let ok = 0;
  let failed = 0;
  for (const p of products) {
    try {
      const res = await withRetry(() => safeGet(p.productUrl, { responseType: 'text', timeout: 25000 }));
      if (typeof res.data !== 'string') { failed++; continue; }
      const d = parseKhaadiDetailHtml(res.data);
      if (d.description) p.description = d.description;
      if (d.sizes.length) p.sizes = d.sizes;
      if (d.available !== undefined) p.isAvailable = d.available;
      ok++;
    } catch (err) {
      failed++;
      logger.warn(`Khaadi detail failed: ${p.productUrl}`, err.message);
    }
    await politeSleep(delayMs);
  }
  logger.info(`Khaadi detail: ${ok} enriched, ${failed} failed of ${products.length}`);
  return products;
}

/**
 * Fetch a Khaadi category URL and extract product rows from SSR HTML.
 */
export async function extractFromKhaadiCategory(pageUrl, maxItems = 50) {
  let html;
  try {
    const res = await withRetry(() =>
      safeGet(pageUrl, { responseType: 'text', timeout: 25000 })
    );
    html = typeof res.data === 'string' ? res.data : null;
  } catch (err) {
    logger.warn(`Khaadi fetch failed: ${pageUrl}`, err.message);
    return { products: [], strategy: 'failed' };
  }

  if (!html) return { products: [], strategy: 'failed' };

  const products = parseKhaadiCategoryHtml(html, pageUrl, maxItems);
  if (products.length === 0) {
    logger.warn(`Khaadi extractor: 0 products for ${pageUrl}`);
    return { products: [], strategy: 'failed' };
  }

  await enrichKhaadiProducts(products);

  logger.info(`Khaadi extractor: ${products.length} products from ${pageUrl}`);
  return { products, strategy: 'khaadi-sfcc' };
}
