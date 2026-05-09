/**
 * KhaadiAdapter.js
 * Khaadi uses a custom platform — HTML extraction is the primary fallback.
 * We still attempt Shopify first since some collections may respond.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { extractFromHtml } from '../extractors/htmlExtractor.js';
import { extractFromShopifyCollection } from '../extractors/shopifyExtractor.js';
import logger from '../utils/logger.js';

export class KhaadiAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['suit', 'kurti', 'ready', 'unstitched', 'western', 'fabric'];
  }

  /**
   * Khaadi's platform may not serve Shopify collection JSON —
   * try Shopify first, fall back to HTML immediately.
   */
  async extractCollectionProducts(collectionUrl, maxItems) {
    // Try Shopify collection format
    const shopifyResult = await extractFromShopifyCollection(collectionUrl, maxItems);
    if (shopifyResult.products.length > 0) return shopifyResult;

    // Fall through to HTML (handled by BaseAdapter strategy 3)
    logger.info(`[Khaadi] Shopify returned 0 for ${collectionUrl}, will try HTML`);
    return { products: [], strategy: 'failed' };
  }
}
