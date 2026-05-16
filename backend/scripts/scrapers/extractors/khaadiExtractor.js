/**
 * khaadiExtractor.js
 * pk.khaadi.com — Salesforce Commerce Cloud PLP tiles are server-rendered:
 * `div.product[data-pid]` + `data-gtmdata` JSON (name, category, price) and
 * PDP links like `/slug/PID.html`.
 */

import * as cheerio from 'cheerio';
import { safeGet, withRetry } from '../utils/requestUtils.js';
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

  logger.info(`Khaadi extractor: ${products.length} products from ${pageUrl}`);
  return { products, strategy: 'khaadi-sfcc' };
}
