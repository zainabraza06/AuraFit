/**
 * BaseAdapter.js
 * Shopify → normalize → validate → optional LLM repair → AI enrich.
 * Pass parserHooks for shoes / watches / jewelry verticals.
 */

import { extractFromShopifyCollection, extractFromShopifyAll, mapShopifyProduct } from '../extractors/shopifyExtractor.js';
import { extractFromHtml } from '../extractors/htmlExtractor.js';
import { normalizeProduct, validateProduct } from '../parsers/productParser.js';
import { enrichProduct, needsAiRefinement } from '../utils/aiEnricher.js';
import { tryRepairWithLLM } from '../utils/productRepair.js';
import { politeSleep } from '../utils/requestUtils.js';
import logger from '../utils/logger.js';

const AI_ENRICH_THRESHOLD = 0.55;

export class BaseAdapter {
  /**
   * @param {object} brandConfig
   * @param {object} [parserHooks]
   * @param {function} parserHooks.normalizeProduct
   * @param {function} parserHooks.validateProduct
   * @param {function} [parserHooks.enrichProduct]
   * @param {function} [parserHooks.needsAiRefinement]
   * @param {string} [parserHooks.vertical] clothing | shoes | watches | jewelry
   * @param {boolean} [parserHooks.enableLlmRepair] default true
   */
  constructor(brandConfig, parserHooks = {}) {
    this.config = brandConfig;
    this.brand = brandConfig.brand;
    this.baseUrl = brandConfig.baseUrl;
    this.category = brandConfig.category;
    this.shopifyKeywords = brandConfig.shopifyKeywords || [];

    this._normalize = parserHooks.normalizeProduct || normalizeProduct;
    this._validate = parserHooks.validateProduct || validateProduct;
    this._enrich = parserHooks.enrichProduct || enrichProduct;
    this._needsAi = parserHooks.needsAiRefinement || needsAiRefinement;
    this._vertical = parserHooks.vertical || 'clothing';
    this._repairWithLlm = parserHooks.enableLlmRepair !== false;
  }

  /**
   * Strategy 2 reads the WHOLE site's /products.json. For clothing that is the intended broad import, but for
   * shoes / watches / jewelry an empty or dead collection used to fall through to the site's first 250 products with
   * no filter at all (keywords are empty for these verticals), so Limelight's missing watch collection filled the
   * watches catalog with tops, co-ord sets, sunglasses and cardigans. Outside clothing it now requires keywords.
   */
  siteWideFallbackAllowed() {
    return this._vertical === 'clothing' || this.shopifyKeywords.length > 0;
  }

  async scrapeCollection(collection) {
    const collectionUrl = `${this.baseUrl}${collection.path}`;
    const maxItems = Number(process.env.SCRAPER_MAX_PER_BRAND ?? 50);

    const brandConfig = {
      brand: this.brand,
      category: this.category,
      subCategory: collection.subCategory,
      occasion: collection.occasion || [],
      style: collection.style || [],
      source: this.constructor.name,
      gender: collection.gender
    };

    let rawProducts = [];
    let strategy = 'failed';

    try {
      const result = await this.extractCollectionProducts(collectionUrl, maxItems);
      if (result.products.length > 0) {
        rawProducts = result.products;
        strategy = result.strategy;
      }
    } catch (err) {
      logger.warn(`[${this.brand}] Strategy 1 failed: ${err.message}`);
    }

    if (rawProducts.length === 0 && this.siteWideFallbackAllowed()) {
      try {
        const result = await extractFromShopifyAll(collectionUrl, maxItems, this.shopifyKeywords);
        if (result.products.length > 0) {
          rawProducts = result.products;
          strategy = result.strategy;
        }
      } catch (err) {
        logger.warn(`[${this.brand}] Strategy 2 failed: ${err.message}`);
      }
    }

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

    const baseOrigin = this.baseUrl;
    const normalized = [];
    const skipAi = String(process.env.SCRAPER_SKIP_AI || '').toLowerCase() === 'true';
    // SKIP_AI disables the LLM repair path too (not just enrichment).
    const useLlmRepair = this._repairWithLlm && !skipAi;
    // This catalog is women-only for the clothing & shoe verticals.
    const womenOnly = this._vertical === 'clothing' || this._vertical === 'shoes' || this._vertical === 'jewelry';
    let droppedGender = 0;

    for (const raw of rawProducts) {
      const mapped = raw.handle !== undefined ? mapShopifyProduct(raw, baseOrigin) : raw;
      if (!mapped) continue;
      // Sold out on the retailer's site: do not store it as available, and do not spend an LLM
      // "repair" call on it (only the clothing parser used to drop these; shoes/jewelry/watches kept them).
      // It is not marked seen, so the stock sweep flags any existing row for it as out of stock.
      if (mapped.isAvailable === false) continue;

      let product = this._normalize(mapped, brandConfig);
      if (!product && useLlmRepair) {
        product = await tryRepairWithLLM(
          mapped,
          brandConfig,
          'normalize returned null',
          this._vertical,
          this._normalize
        );
      }
      if (!product) continue;

      let { valid, reason } = this._validate(product);
      if (!valid && useLlmRepair) {
        const repaired = await tryRepairWithLLM(mapped, brandConfig, reason, this._vertical, this._normalize);
        if (repaired) {
          product = repaired;
          ({ valid, reason } = this._validate(product));
        }
      }
      if (!valid) {
        logger.warn(`[${this.brand}] Skipped: ${reason}`, mapped.title || '');
        continue;
      }

      // Women-only catalog: drop men's / kids' items (intentional, not a failure).
      if (womenOnly && (product.gender === 'men' || product.gender === 'kids')) {
        droppedGender++;
        continue;
      }

      if (!skipAi && (product.metadataScore < AI_ENRICH_THRESHOLD || this._needsAi(product))) {
        // AI enrichment is best-effort. If every LLM provider is down the product is still valid
        // without it - never let an outage abort the whole scrape (it used to crash shoes/jewelry runs).
        try {
          product = await this._enrich(product);
        } catch (err) {
          logger.warn(`[${this.brand}] AI enrichment skipped for "${product.name}": ${err.message}`);
        }
        await politeSleep(300);
      }

      normalized.push(product);
      await politeSleep(150);
    }

    if (droppedGender > 0) {
      logger.info(`[${this.brand}] ${collection.path}: dropped ${droppedGender} non-women item(s)`);
    }

    logger.success(`[${this.brand}] ${collection.path}: ${normalized.length} products (${strategy})`);
    return { products: normalized, strategy, url: collectionUrl };
  }

  async extractCollectionProducts(collectionUrl, maxItems) {
    return extractFromShopifyCollection(collectionUrl, maxItems);
  }

  getHtmlOptions() {
    return {};
  }

  async scrapeAll() {
    const collections = this.config.collections || [];
    const results = [];

    for (const collection of collections) {
      await politeSleep();
      const result = await this.scrapeCollection(collection);
      results.push(result);
    }

    const total = results.reduce((sum, r) => sum + r.products.length, 0);
    logger.info(`[${this.brand}] Total: ${total} products across ${collections.length} collections`);

    return results;
  }
}
