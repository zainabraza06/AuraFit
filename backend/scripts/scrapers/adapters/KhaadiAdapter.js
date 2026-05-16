/**
 * KhaadiAdapter.js
 * Khaadi PK — Demandware / SFCC (not Shopify). Uses SSR PLP tiles only.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { extractFromKhaadiCategory } from '../extractors/khaadiExtractor.js';

export class KhaadiAdapter extends BaseAdapter {
  async extractCollectionProducts(collectionUrl, maxItems) {
    return extractFromKhaadiCategory(collectionUrl, maxItems);
  }
}
