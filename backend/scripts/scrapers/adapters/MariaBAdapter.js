/**
 * MariaBAdapter.js
 * Maria B is a Shopify store — standard collection JSON works well.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class MariaBAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['suit', 'kurti', 'shirt', 'trouser', 'dress', 'bridal', 'formal', 'pret', 'lawn'];
  }
}
