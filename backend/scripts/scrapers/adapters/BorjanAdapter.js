/**
 * BorjanAdapter.js
 * Borjan — Shopify shoe store.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { SHOE_ADAPTER_HOOKS } from '../parsers/shoeParser.js';

export class BorjanAdapter extends BaseAdapter {
  constructor(config) {
    super(config, SHOE_ADAPTER_HOOKS);
    this.shopifyKeywords = ['women', 'heels', 'flat', 'sandal', 'pump', 'wedge'];
  }
}
