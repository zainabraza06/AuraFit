import { BaseAdapter } from './BaseAdapter.js';

/**
 * ZellburyAdapter
 * Brand: Zellbury (zellbury.com)
 * Platform: Shopify
 * Strategy: Primary Shopify JSON, secondary HTML.
 */
export class ZellburyAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
  }

  /**
   * Zellbury specific normalization if needed.
   * Inherits standard Shopify logic from BaseAdapter.
   */
  async scrapeAll() {
    // Zellbury uses standard Shopify collections.
    // BaseAdapter.scrapeAll() will iterate through collections 
    // and try Strategy 1 (Collection JSON), Strategy 2 (All Products JSON), 
    // and Strategy 3 (HTML) automatically.
    return super.scrapeAll();
  }
}
