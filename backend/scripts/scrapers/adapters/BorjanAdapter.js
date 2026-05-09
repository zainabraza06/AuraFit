/**
 * BorjanAdapter.js
 * Borjan — Shopify shoe store.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class BorjanAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['women', 'heels', 'flat', 'sandal', 'pump', 'wedge'];
  }
}
