/**
 * ECSAdapter.js
 * ECS (Ethnicity Clothing Studio) — Shopify shoe store.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class ECSAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['heels', 'flat', 'sandal', 'loafer', 'mule', 'shoe'];
  }
}
