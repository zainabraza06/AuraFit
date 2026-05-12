/**
 * NdureAdapter.js
 * Ndure — Shopify store focusing on sneakers, sandals, and flats.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { SHOE_ADAPTER_HOOKS } from '../parsers/shoeParser.js';

export class NdureAdapter extends BaseAdapter {
  constructor(config) {
    super(config, SHOE_ADAPTER_HOOKS);
    this.shopifyKeywords = ['women', 'sneaker', 'sandal', 'flat', 'slipper', 'sports'];
  }
}
