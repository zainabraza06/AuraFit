/**
 * SanaSafinazAdapter.js
 * Sana Safinaz is a Shopify store — standard collection JSON works well.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class SanaSafinazAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['suit', 'kurti', 'shirt', 'trouser', 'dress', 'bridal', 'formal', 'lawn', 'muzlin'];
  }
}
