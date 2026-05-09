/**
 * HushPuppiesAdapter.js
 * Hush Puppies Pakistan — may be Shopify or custom platform.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class HushPuppiesAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['women', 'casual', 'flat', 'sandal', 'loafer', 'moccasin'];
  }
}
