/**
 * LimelightAdapter.js
 * Limelight is a Shopify store — standard collection JSON works well.
 */
import { BaseAdapter } from './BaseAdapter.js';

export class LimelightAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.shopifyKeywords = ['suit', 'kurti', 'shirt', 'dupatta', 'trouser', 'western'];
  }
}
