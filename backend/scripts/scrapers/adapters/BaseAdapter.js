/**
 * BaseAdapter.js
 * Abstract base class for all brand scraper adapters.
 * Provides the 3-strategy pipeline: Shopify Collection → Shopify All → HTML.
 * Subclasses can override extractCollectionProducts / extractProductDetails
 * to handle brand-specific quirks.
 */

import { extractFromShopifyCollection, extractFromShopifyAll, mapShopifyProduct } from '../extractors/shopifyExtractor.js';
import { extractFromHtml } from '../extractors/htmlExtractor.js';
import { normalizeProduct, validateProduct } from '../parsers/productParser.js';
import { politeSleep, withRetry } from '../utils/requestUtils.js';
import logger from '../utils/logger.js';

export class BaseAdapter {
  /**
   * @param {object} brandConfig - Full brand config from clothingBrands.js / shoeBrands.js
   */
  constructor(brandConfig) {
    this.config = brandConfig;
    this.brand = brandConfig.brand;
    this.baseUrl = brandConfig.baseUrl;
    this.category = brandConfig.category;
  }

  /**
   * scrapeCollection(collection)
   * Runs the 3-strategy pipeline for a single collection config.
   * Returns an array of validated, normalized product objects.
   */
  async scrapeCollection(collection) {
    const collectionUrl = `${this.baseUrl}${collection.path}`;
    const maxItems = Number(process.env.SCRAPER_MAX_PER_BRAND ?? 50);
    const brandConfig = {
      brand: this.brand,
      category: this.category,
      subCategory: collection.subCategory,
      occasion: collection.occasion || [],
      style: collection.style || [],
      source: this.constructor.name
    };

    let rawProducts = [];
    let strategy = 'failed';

    // ── Strategy 1: Shopify Collection JSON ──────────────────────────
    try {
      const result = await this.extractCollectionProducts(collectionUrl, maxItems);
      if (result.products.length > 0) {
        rawProducts = result.products;
        strategy = result.strategy;
      }
    } catch (err) {
      logger.warn(`[${this.brand}] Strategy 1 failed: ${err.message}`);
    }

    // ── Strategy 2: Shopify /products.json ───────────────────────────
    if (rawProducts.length === 0) {
      try {
        const result = await extractFromShopifyAll(collectionUrl, maxItems, this.shopifyKeywords || []);
        if (result.products.length > 0) {
          rawProducts = result.products;
          strategy = result.strategy;
        }
      } catch (err) {
        logger.warn(`[${this.brand}] Strategy 2 failed: ${err.message}`);
      }
    }

    // ── Strategy 3: HTML / Cheerio ────────────────────────────────────
    if (rawProducts.length === 0) {
      try {
        await politeSleep();
        const result = await extractFromHtml(collectionUrl, maxItems, this.getHtmlOptions());
        if (result.products.length > 0) {
          rawProducts = result.products;
          strategy = result.strategy;
        }
      } catch (err) {
        logger.warn(`[${this.brand}] Strategy 3 failed: ${err.message}`);
      }
    }

    if (rawProducts.length === 0) {
      logger.warn(`[${this.brand}] No products found for: ${collection.path}`);
      return { products: [], strategy: 'failed', url: collectionUrl };
    }

    // ── Normalize & Validate ─────────────────────────────────────────
    const baseOrigin = this.baseUrl;
    const normalized = [];

    for (const raw of rawProducts) {
      // Map Shopify raw product if needed
      const mapped = raw.handle !== undefined ? mapShopifyProduct(raw, baseOrigin) : raw;
      if (!mapped) continue;

      const product = normalizeProduct(mapped, brandConfig);
      const { valid, reason } = validateProduct(product);

      if (valid) {
        normalized.push(product);
      } else {
        logger.warn(`[${this.brand}] Skipped product: ${reason}`, mapped.title || '');
      }

      await politeSleep(200); // micro-delay between processing
    }

    logger.success(`[${this.brand}] ${collection.path}: ${normalized.length} valid products (${strategy})`);
    return { products: normalized, strategy, url: collectionUrl };
  }

  /**
   * extractCollectionProducts(collectionUrl, maxItems)
   * Default: uses Shopify collection JSON extractor.
   * Override in subclasses for brand-specific logic.
   */
  async extractCollectionProducts(collectionUrl, maxItems) {
    return extractFromShopifyCollection(collectionUrl, maxItems);
  }

  /**
   * getHtmlOptions()
   * Returns options passed to extractFromHtml in Strategy 3.
   * Override in subclasses for non-Shopify sites that use different URL formats.
   */
  getHtmlOptions() {
    return {};
  }

  /**
   * scrapeAll()
   * Iterates over all collections in the brand config.
   * Returns aggregated results for this brand.
   */
  async scrapeAll() {
    const collections = this.config.collections || [];
    const results = [];

    for (const collection of collections) {
      await politeSleep(); // polite delay between collections
      const result = await this.scrapeCollection(collection);
      results.push(result);
    }

    const totalProducts = results.reduce((sum, r) => sum + r.products.length, 0);
    logger.info(`[${this.brand}] Total scraped: ${totalProducts} products across ${collections.length} collections`);

    return results;
  }
}
