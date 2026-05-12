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

    if (rawProducts.length === 0) {
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

    for (const raw of rawProducts) {
      const mapped = raw.handle !== undefined ? mapShopifyProduct(raw, baseOrigin) : raw;
      if (!mapped) continue;

      let product = this._normalize(mapped, brandConfig);
      if (!product && this._repairWithLlm) {
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
      if (!valid && this._repairWithLlm) {
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

      if (product.metadataScore < AI_ENRICH_THRESHOLD || this._needsAi(product)) {
        product = await this._enrich(product);
        await politeSleep(300);
      }

      normalized.push(product);
      await politeSleep(150);
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
