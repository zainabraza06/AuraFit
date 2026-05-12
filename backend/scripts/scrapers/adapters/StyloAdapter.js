/**
 * StyloAdapter.js
 * Stylo — Shopify shoe store.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { SHOE_ADAPTER_HOOKS } from '../parsers/shoeParser.js';

export class StyloAdapter extends BaseAdapter {
  constructor(config) {
    super(config, SHOE_ADAPTER_HOOKS);
    this.shopifyKeywords = ['heels', 'flat', 'sandal', 'khussa', 'shoe', 'slipper'];
  }
}
