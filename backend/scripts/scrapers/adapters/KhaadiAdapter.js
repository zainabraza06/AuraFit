/**
 * KhaadiAdapter.js
 * Khaadi uses a custom platform (not Shopify).
 * Product URLs use path-based .html format, not /products/.
 * HTML extraction is the primary strategy; Shopify is attempted first as a fast-path check.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { extractFromShopifyCollection } from '../extractors/shopifyExtractor.js';
import logger from '../utils/logger.js';

export class KhaadiAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['suit', 'kurti', 'ready', 'unstitched', 'western', 'fabric'];
  }

  /**
   * Khaadi is not a Shopify store — Shopify JSON always returns 0 or 404.
   * Return failed immediately so BaseAdapter falls through to HTML (Strategy 3).
   */
  async extractCollectionProducts(collectionUrl, maxItems) {
    const shopifyResult = await extractFromShopifyCollection(collectionUrl, maxItems);
    if (shopifyResult.products.length > 0) return shopifyResult;

    logger.info(`[Khaadi] Shopify returned 0 for ${collectionUrl}, will try HTML`);
    return { products: [], strategy: 'failed' };
  }

  /**
   * Khaadi product URLs use .html paths (e.g. /ready-to-wear/essentials/3-piece/product.html),
   * not the /products/ pattern expected by Shopify-based HTML extraction.
   */
  getHtmlOptions() {
    return {
      urlValidator: (url) =>
        url.includes('/products/') ||
        (url.includes('khaadi.com') && url.split('/').filter(Boolean).length >= 3)
    };
  }
}
