/**
 * ECSAdapter.js
 * ECS (Ethnicity Clothing Studio) — Shopify shoe store.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { SHOE_ADAPTER_HOOKS } from '../parsers/shoeParser.js';

export class ECSAdapter extends BaseAdapter {
  constructor(config) {
    super(config, SHOE_ADAPTER_HOOKS);
    this.shopifyKeywords = ['heels', 'flat', 'sandal', 'loafer', 'mule', 'shoe'];
  }
}
