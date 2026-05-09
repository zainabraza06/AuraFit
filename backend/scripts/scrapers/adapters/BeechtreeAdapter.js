/**
 * BeechtreeAdapter.js
 * Beechtree is a Shopify store — standard collection JSON works well.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class BeechtreeAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    // Keywords to help filter /products.json fallback
    this.shopifyKeywords = ['suit', 'kurti', 'shirt', 'trouser', 'bottom', 'dress'];
  }
}
