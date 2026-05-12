/**
 * index.js — Scraper Orchestrator (Clothing)
 * Loads all clothing brand configs, runs adapters,
 * and upserts ClothingProduct documents into MongoDB.
 *
 * Usage:
 *   npm run scrape              — full run
 *   SCRAPER_DRY_RUN=true npm run scrape  — no DB writes
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import connectDB from '../../config/db.js';
import ClothingProduct from '../../models/ClothingProduct.js';
import ScraperLog from '../../models/ScraperLog.js';
import logger from './utils/logger.js';

import { CLOTHING_BRANDS } from './config/clothingBrands.js';

// ─── Adapter registry ─────────────────────────────────────────────────────────
import { BeechtreeAdapter }   from './adapters/BeechtreeAdapter.js';
import { LimelightAdapter }   from './adapters/LimelightAdapter.js';
import { ZellburyAdapter }    from './adapters/ZellburyAdapter.js';
import { AlkaramAdapter }     from './adapters/AlkaramAdapter.js';
import { GulAhmedAdapter }    from './adapters/GulAhmedAdapter.js';
import { MariaBAdapter }      from './adapters/MariaBAdapter.js';
import { SanaSafinazAdapter } from './adapters/SanaSafinazAdapter.js';
import { ElanAdapter }        from './adapters/ElanAdapter.js';
import { ShopifyGenericAdapter } from './adapters/ShopifyGenericAdapter.js';

const ADAPTER_MAP = {
  BeechtreeAdapter,
  LimelightAdapter,
  ZellburyAdapter,
  AlkaramAdapter,
  GulAhmedAdapter,
  MariaBAdapter,
  SanaSafinazAdapter,
  ElanAdapter,
  ShopifyGenericAdapter
};

// ─── Upsert helper ────────────────────────────────────────────────────────────
async function upsertProduct(product) {
  const doc = await ClothingProduct.findOneAndUpdate(
    { productUrl: product.productUrl },
    { $set: product },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const age = Date.now() - new Date(doc.scrapedAt || doc.createdAt).getTime();
  return age < 15000 ? 'inserted' : 'updated';
}

// ─── Main runner ──────────────────────────────────────────────────────────────
export async function runScraper({ triggeredBy = 'manual' } = {}) {
  const dryRun = String(process.env.SCRAPER_DRY_RUN || '').toLowerCase() === 'true';
  const runId  = new Date().toISOString();

  logger.info('════════════════════════════════════════');
  logger.info(`AuraFit Clothing Scraper — ${runId}`);
  logger.info(`Dry Run: ${dryRun} | Triggered by: ${triggeredBy}`);
  logger.info('════════════════════════════════════════');

  const startTime = Date.now();

  let scraperLog = null;
  if (!dryRun) {
    await connectDB();
    scraperLog = await ScraperLog.create({
      runId,
      status: 'running',
      triggeredBy,
      startedAt: new Date(),
      stats: { totalBrands: CLOTHING_BRANDS.length }
    });
  }

  let totalInserted = 0, totalUpdated = 0, totalSkipped = 0, totalFailed = 0;
  const brandResults = [];

  for (const brandConfig of CLOTHING_BRANDS) {
    const AdapterClass = ADAPTER_MAP[brandConfig.adapter];
    if (!AdapterClass) {
      logger.warn(`No adapter for: ${brandConfig.adapter} — skipping`);
      continue;
    }

    const adapter = new AdapterClass(brandConfig);
    logger.info(`\n▶ ${brandConfig.brand} (${brandConfig.baseUrl})`);

    const collectionResults = await adapter.scrapeAll();
    let ins = 0, upd = 0, skp = 0, fail = 0;

    for (const result of collectionResults) {
      if (result.strategy === 'failed') { fail++; continue; }

      for (const product of result.products) {
        if (dryRun) {
          logger.info(`[DRY] ${product.name} | ${product.pieceType} | ${product.stitchedType} | ${product.dressStyle} | ${product.pattern} | PKR ${product.price}`);
          ins++;
          continue;
        }
        try {
          const outcome = await upsertProduct(product);
          if (outcome === 'inserted') ins++;
          else upd++;
        } catch (err) {
          logger.error(`DB upsert failed: ${product.productUrl}`, err.message);
          skp++;
        }
      }
    }

    totalInserted += ins;
    totalUpdated  += upd;
    totalSkipped  += skp;
    totalFailed   += fail;

    brandResults.push({
      brand:    brandConfig.brand,
      url:      brandConfig.baseUrl,
      inserted: ins,
      updated:  upd,
      skipped:  skp,
      failed:   fail,
      strategy: collectionResults[0]?.strategy || 'unknown'
    });

    logger.success(`✓ ${brandConfig.brand}: +${ins} inserted, ~${upd} updated, ✗${fail} failed`);
  }

  const durationMs = Date.now() - startTime;

  if (!dryRun && scraperLog) {
    await ScraperLog.findByIdAndUpdate(scraperLog._id, {
      status: 'completed',
      completedAt: new Date(),
      durationMs,
      stats: { totalBrands: CLOTHING_BRANDS.length, totalInserted, totalUpdated, totalSkipped, totalFailed },
      brandResults
    });
  }

  logger.info('\n════════════════════════════════════════');
  logger.success(`Scrape Complete in ${(durationMs / 1000).toFixed(1)}s`);
  logger.info(`Inserted: ${totalInserted} | Updated: ${totalUpdated} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  logger.info('════════════════════════════════════════\n');

  return { totalInserted, totalUpdated, totalSkipped, totalFailed, durationMs };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
const isMain = (() => {
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();

if (isMain) {
  runScraper({ triggeredBy: 'cli' })
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Scraper crashed:', err.message);
      process.exit(1);
    });
}
