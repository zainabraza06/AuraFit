/**
 * index.js — Scraper Orchestrator
 * Loads all brand configs, instantiates the correct adapter,
 * runs scraping, and upserts products into MongoDB.
 * 
 * Usage:
 *   npm run scrape              — full run
 *   SCRAPER_DRY_RUN=true npm run scrape  — no DB writes
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import connectDB from '../../config/db.js';
import Product from '../../models/Product.js';
import ScraperLog from '../../models/ScraperLog.js';
import logger from './utils/logger.js';

import { CLOTHING_BRANDS } from './config/clothingBrands.js';
import { SHOE_BRANDS } from './config/shoeBrands.js';

// ─── Adapter registry ─────────────────────────────────────────────────────────
import { BeechtreeAdapter }   from './adapters/BeechtreeAdapter.js';
import { LimelightAdapter }   from './adapters/LimelightAdapter.js';
import { ZellburyAdapter }    from './adapters/ZellburyAdapter.js';
import { AlkaramAdapter }     from './adapters/AlkaramAdapter.js';
import { GulAhmedAdapter }    from './adapters/GulAhmedAdapter.js';
import { StyloAdapter }       from './adapters/StyloAdapter.js';
import { ECSAdapter }         from './adapters/ECSAdapter.js';
import { BorjanAdapter }      from './adapters/BorjanAdapter.js';
import { HushPuppiesAdapter } from './adapters/HushPuppiesAdapter.js';
import { NdureAdapter }       from './adapters/NdureAdapter.js';

const ADAPTER_MAP = {
  BeechtreeAdapter,
  LimelightAdapter,
  ZellburyAdapter,
  AlkaramAdapter,
  GulAhmedAdapter,
  StyloAdapter,
  ECSAdapter,
  BorjanAdapter,
  HushPuppiesAdapter,
  NdureAdapter
};

// ─── Upsert helper ────────────────────────────────────────────────────────────

async function upsertProduct(product) {
  const result = await Product.findOneAndUpdate(
    { productUrl: product.productUrl },
    { $set: product },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // Check if it was an insert or update
  const wasInserted = result.createdAt && (Date.now() - new Date(result.createdAt).getTime()) < 10000;
  return wasInserted ? 'inserted' : 'updated';
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runScraper({ triggeredBy = 'manual' } = {}) {
  const dryRun = String(process.env.SCRAPER_DRY_RUN || '').toLowerCase() === 'true';
  const runId = new Date().toISOString();

  logger.info(`========================================`);
  logger.info(`Fashion Scraper Starting — ${runId}`);
  logger.info(`Dry Run: ${dryRun} | Triggered by: ${triggeredBy}`);
  logger.info(`========================================`);

  const startTime = Date.now();
  const allBrands = [...CLOTHING_BRANDS, ...SHOE_BRANDS];

  // ── Create scraper log entry ──
  let scraperLog = null;
  if (!dryRun) {
    await connectDB();
    scraperLog = await ScraperLog.create({
      runId,
      status: 'running',
      triggeredBy,
      startedAt: new Date(),
      stats: { totalBrands: allBrands.length }
    });
  }

  const brandResults = [];
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  // ── Process each brand ──
  for (const brandConfig of allBrands) {
    const AdapterClass = ADAPTER_MAP[brandConfig.adapter];
    if (!AdapterClass) {
      logger.warn(`No adapter found for: ${brandConfig.adapter}`);
      continue;
    }

    const adapter = new AdapterClass(brandConfig);
    logger.info(`\n▶ Scraping brand: ${brandConfig.brand} (${brandConfig.category})`);

    const collectionResults = await adapter.scrapeAll();
    let brandInserted = 0, brandUpdated = 0, brandSkipped = 0, brandFailed = 0;

    for (const result of collectionResults) {
      if (result.strategy === 'failed') {
        brandFailed++;
        continue;
      }

      for (const product of result.products) {
        if (!dryRun) {
          try {
            const outcome = await upsertProduct(product);
            if (outcome === 'inserted') brandInserted++;
            else brandUpdated++;
          } catch (err) {
            logger.error(`DB upsert failed: ${product.productUrl}`, err.message);
            brandSkipped++;
          }
        } else {
          logger.info(`[DRY RUN] Would upsert: ${product.name} — ${product.productUrl}`);
          brandInserted++; // Count for dry-run stats
        }
      }
    }

    totalInserted += brandInserted;
    totalUpdated += brandUpdated;
    totalSkipped += brandSkipped;
    totalFailed += brandFailed;

    brandResults.push({
      brand: brandConfig.brand,
      url: brandConfig.baseUrl,
      inserted: brandInserted,
      updated: brandUpdated,
      skipped: brandSkipped,
      failed: brandFailed,
      strategy: collectionResults[0]?.strategy || 'unknown'
    });

    logger.success(`✓ ${brandConfig.brand}: +${brandInserted} inserted, ~${brandUpdated} updated, ✗${brandFailed} failed`);
  }

  const durationMs = Date.now() - startTime;

  // ── Finalize scraper log ──
  if (!dryRun && scraperLog) {
    await ScraperLog.findByIdAndUpdate(scraperLog._id, {
      status: 'completed',
      completedAt: new Date(),
      durationMs,
      stats: {
        totalBrands: allBrands.length,
        totalInserted,
        totalUpdated,
        totalSkipped,
        totalFailed
      },
      brandResults
    });
  }

  logger.info(`\n========================================`);
  logger.success(`Scrape Complete in ${(durationMs / 1000).toFixed(1)}s`);
  logger.info(`Inserted: ${totalInserted} | Updated: ${totalUpdated} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  logger.info(`========================================\n`);

  return { totalInserted, totalUpdated, totalSkipped, totalFailed, durationMs };
}

// ─── Run as CLI ───────────────────────────────────────────────────────────────
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
