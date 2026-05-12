/**
 * testScraper.js
 * Quick validation script — scrapes ONE collection per brand (dry run),
 * prints a table of extracted fields, and shows any gaps.
 *
 * Usage:
 *   node scripts/scrapers/testScraper.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { CLOTHING_BRANDS } from './scrapers/config/clothingBrands.js';
import { BeechtreeAdapter }   from './scrapers/adapters/BeechtreeAdapter.js';
import { LimelightAdapter }   from './scrapers/adapters/LimelightAdapter.js';
import { ZellburyAdapter }    from './scrapers/adapters/ZellburyAdapter.js';
import { AlkaramAdapter }     from './scrapers/adapters/AlkaramAdapter.js';
import { GulAhmedAdapter }    from './scrapers/adapters/GulAhmedAdapter.js';
import { MariaBAdapter }      from './scrapers/adapters/MariaBAdapter.js';
import { SanaSafinazAdapter } from './scrapers/adapters/SanaSafinazAdapter.js';
import { ElanAdapter }        from './scrapers/adapters/ElanAdapter.js';

const ADAPTER_MAP = {
  BeechtreeAdapter, LimelightAdapter, ZellburyAdapter, AlkaramAdapter,
  GulAhmedAdapter, MariaBAdapter, SanaSafinazAdapter, ElanAdapter
};

const KEY_FIELDS = [
  'name','brand','price','priceRange','subCategory','pieceType',
  'stitchedType','dressStyle','fashionType','pattern','colorFamily',
  'fabric','sleeveType','neckline','fitType','gender','occasion',
  'trendTags','aiEnriched','metadataScore'
];

async function testBrand(brandConfig) {
  const AdapterClass = ADAPTER_MAP[brandConfig.adapter];
  if (!AdapterClass) {
    console.log(`[SKIP] No adapter for ${brandConfig.adapter}`);
    return;
  }

  // Only test first collection to keep it fast
  const singleColConfig = { ...brandConfig, collections: [brandConfig.collections[0]] };
  const adapter = new AdapterClass(singleColConfig);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`▶  ${brandConfig.brand}  —  ${brandConfig.collections[0].path}`);
  console.log('═'.repeat(70));

  const results = await adapter.scrapeAll();
  const products = results.flatMap(r => r.products).slice(0, 3); // show first 3

  if (products.length === 0) {
    console.log('  ✗ No products extracted');
    return;
  }

  for (const p of products) {
    console.log(`\n  📦 ${p.name}`);
    const gaps = [];
    for (const f of KEY_FIELDS) {
      const v = p[f];
      const empty = v === undefined || v === null || (Array.isArray(v) && v.length === 0);
      const display = Array.isArray(v) ? v.join(', ') : String(v ?? '—');
      const icon = empty ? '  ⚠' : '  ✓';
      if (empty) gaps.push(f);
      console.log(`${icon}  ${f.padEnd(18)} ${display}`);
    }
    if (gaps.length > 0) {
      console.log(`\n     Missing: ${gaps.join(', ')}`);
    }
    console.log(`     Score: ${p.metadataScore} ${p.metadataScore >= 0.65 ? '✓ GOOD' : '⚠ LOW (AI enrichment needed)'}`);
  }
}

async function main() {
  console.log('AuraFit Scraper Field Validation Test\n');

  for (const brandConfig of CLOTHING_BRANDS) {
    await testBrand(brandConfig);
  }

  console.log('\n\nTest complete.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
