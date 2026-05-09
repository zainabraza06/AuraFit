/**
 * NdureAdapter.js
 * Ndure — Shopify store focusing on sneakers, sandals, and flats.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class NdureAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['women', 'sneaker', 'sandal', 'flat', 'slipper', 'sports'];
  }
}
