/**
 * HushPuppiesAdapter.js
 * Hush Puppies Pakistan — may be Shopify or custom platform.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { SHOE_ADAPTER_HOOKS } from '../parsers/shoeParser.js';

export class HushPuppiesAdapter extends BaseAdapter {
  constructor(config) {
    super(config, SHOE_ADAPTER_HOOKS);
    this.shopifyKeywords = ['women', 'casual', 'flat', 'sandal', 'loafer', 'moccasin'];
  }
}
