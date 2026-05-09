/**
 * AlkaramAdapter.js
 * Alkaram Studio — Shopify store.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class AlkaramAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['suit', 'kurti', 'shirt', 'trouser', 'festive', 'lawn', 'embroidered'];
  }
}
