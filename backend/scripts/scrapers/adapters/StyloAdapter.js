/**
 * StyloAdapter.js
 * Stylo — Shopify shoe store.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class StyloAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['heels', 'flat', 'sandal', 'khussa', 'shoe', 'slipper'];
  }
}
