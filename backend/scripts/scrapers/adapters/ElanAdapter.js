/**
 * ElanAdapter.js
 * Elan is a Shopify store — standard collection JSON works well.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class ElanAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['suit', 'kurti', 'shirt', 'trouser', 'dress', 'bridal', 'formal', 'festive', 'pret'];
  }
}
