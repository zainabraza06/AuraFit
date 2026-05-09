/**
 * GulAhmedAdapter.js
 * Gul Ahmed — Shopify store with a large catalogue.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class GulAhmedAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['suit', 'lawn', 'kurti', 'formal', 'embroidered', 'unstitched', 'ready-to-wear'];
  }
}
