/**
 * index.js — Scraper Orchestrator (Clothing)
 * Loads all clothing brand configs, runs adapters,
 * and upserts ClothingProduct documents into MongoDB.
 *
 * Smart upsert: only writes fields that actually changed.
 * Stock tracking: products absent from a brand run are marked inStock:false.
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
import { checkConsistency } from './utils/catalogQA.js';
import { tryRepairWithLLM } from './utils/productRepair.js';
import { normalizeProduct } from './parsers/productParser.js';

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
import { KhaadiAdapter } from './adapters/KhaadiAdapter.js';

const ADAPTER_MAP = {
  BeechtreeAdapter,
  LimelightAdapter,
  ZellburyAdapter,
  AlkaramAdapter,
  GulAhmedAdapter,
  MariaBAdapter,
  SanaSafinazAdapter,
  ElanAdapter,
  ShopifyGenericAdapter,
  KhaadiAdapter
};

// ─── Change detection ─────────────────────────────────────────────────────────
/**
 * Returns true if any meaningful product field differs from what's in the DB.
 * Embeddings and AI fields are excluded — those are expensive to regenerate
 * and only change when the scraper explicitly re-enriches.
 */
function hasChanged(existing, incoming) {
  if (existing.price !== incoming.price) return true;
  if (existing.compareAtPrice !== incoming.compareAtPrice) return true;
  if (existing.name !== incoming.name) return true;
  const existingImg = existing.imageUrl || existing.images?.[0] || '';
  const incomingImg = incoming.imageUrl || incoming.images?.[0] || '';
  if (existingImg !== incomingImg) return true;
  // Sizes — compare sorted to ignore ordering differences
  const s1 = JSON.stringify([...(existing.sizes || [])].sort());
  const s2 = JSON.stringify([...(incoming.sizes || [])].sort());
  if (s1 !== s2) return true;
  return false;
}

// ─── Smart upsert ─────────────────────────────────────────────────────────────
/**
 * Outcomes:
 *   'inserted'  — new product added
 *   'updated'   — product existed and at least one field changed
 *   'unchanged' — product existed, nothing changed (only stock timestamp refreshed)
 */
async function upsertProduct(product) {
  const now = new Date();
  const existing = await ClothingProduct.findOne(
    { productUrl: product.productUrl },
    'price compareAtPrice name imageUrl images sizes'
  ).lean();

  if (!existing) {
    await ClothingProduct.create({
      ...product,
      inStock: true,
      stockLastChecked: now
    });
    return 'inserted';
  }

  if (!hasChanged(existing, product)) {
    // Nothing meaningful changed — just refresh the stock confirmation timestamp
    await ClothingProduct.updateOne(
      { productUrl: product.productUrl },
      { $set: { inStock: true, stockLastChecked: now } }
    );
    return 'unchanged';
  }

  // Something changed — write the full update
  await ClothingProduct.findOneAndUpdate(
    { productUrl: product.productUrl },
    { $set: { ...product, inStock: true, stockLastChecked: now } },
    { upsert: true }
  );
  return 'updated';
}

// ─── Mark absent products as out-of-stock ────────────────────────────────────
/**
 * After scraping a brand, any DB product whose URL wasn't seen in this run
 * is considered out-of-stock (removed from the live site).
 */
async function markOutOfStock(brand, seenUrls) {
  if (!seenUrls.size) return 0;
  const result = await ClothingProduct.updateMany(
    {
      brand,
      productUrl: { $nin: [...seenUrls] },
      inStock:    { $ne: false }           // only update those currently marked in-stock
    },
    { $set: { inStock: false, stockLastChecked: new Date() } }
  );
  return result.modifiedCount;
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

  let totalInserted = 0, totalUpdated = 0, totalUnchanged = 0, totalSkipped = 0, totalFailed = 0, totalStockOut = 0;
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
    let ins = 0, upd = 0, unchanged = 0, skp = 0, fail = 0;
    let qaHard = 0, qaSoft = 0, qaRepaired = 0;
    const seenUrls = new Set();

    for (const result of collectionResults) {
      if (result.strategy === 'failed') { fail++; continue; }

      for (let product of result.products) {
        // ── Inline QA consistency check ──────────────────────────────────────
        const qa = checkConsistency(product);

        if (qa.soft.length > 0) {
          qaSoft += qa.soft.length;
          logger.debug(
            `[QA] soft on ${product.productUrl}: ` +
            qa.soft.map(i => i.detail).join(' | '),
          );
        }

        if (qa.hard.length > 0) {
          qaHard += qa.hard.length;
          const reason = qa.hard.map(i => i.detail).join('; ');
          logger.warn(`[QA] hard issue — ${product.brand} "${product.name}": ${reason}`);

          // LLM repair only when AI is enabled (SKIP_AI disables it, as for enrichment).
          const skipAi = String(process.env.SCRAPER_SKIP_AI || '').toLowerCase() === 'true';
          if (!dryRun && !skipAi) {
            const repaired = await tryRepairWithLLM(
              product, brandConfig, reason, 'clothing', normalizeProduct,
            );
            if (repaired) {
              product = repaired;
              qaRepaired++;
              logger.info(`[QA] repaired: ${product.productUrl}`);
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        if (dryRun) {
          logger.info(`[DRY] ${product.name} | ${product.pieceType} | ${product.stitchedType} | ${product.dressStyle} | ${product.pattern} | PKR ${product.price}`);
          ins++;
          continue;
        }
        try {
          const outcome = await upsertProduct(product);
          seenUrls.add(product.productUrl);
          if (outcome === 'inserted') ins++;
          else if (outcome === 'updated') upd++;
          else unchanged++;
        } catch (err) {
          logger.error(`DB upsert failed: ${product.productUrl}`, err.message);
          skp++;
        }
      }
    }

    // Mark products absent from this run as out-of-stock
    let stockOut = 0;
    if (!dryRun && seenUrls.size > 0) {
      stockOut = await markOutOfStock(brandConfig.brand, seenUrls);
      if (stockOut > 0) {
        logger.warn(`  ↓ ${stockOut} products from ${brandConfig.brand} marked out-of-stock (not seen in this run)`);
      }
    }

    totalInserted  += ins;
    totalUpdated   += upd;
    totalUnchanged += unchanged;
    totalSkipped   += skp;
    totalFailed    += fail;
    totalStockOut  += stockOut;

    brandResults.push({
      brand:      brandConfig.brand,
      url:        brandConfig.baseUrl,
      inserted:   ins,
      updated:    upd,
      unchanged,
      skipped:    skp,
      failed:     fail,
      stockOut,
      strategy:   collectionResults[0]?.strategy || 'unknown',
      qa:         { hard: qaHard, soft: qaSoft, repaired: qaRepaired },
    });

    const qaNote = qaHard > 0 ? ` | QA: ${qaHard} hard (${qaRepaired} repaired), ${qaSoft} soft` : '';
    logger.success(`✓ ${brandConfig.brand}: +${ins} new, ~${upd} updated, =${unchanged} unchanged, ↓${stockOut} out-of-stock, ✗${fail} failed${qaNote}`);
  }

  const durationMs = Date.now() - startTime;

  if (!dryRun && scraperLog) {
    await ScraperLog.findByIdAndUpdate(scraperLog._id, {
      status: 'completed',
      completedAt: new Date(),
      durationMs,
      stats: {
        totalBrands: CLOTHING_BRANDS.length,
        totalInserted,
        totalUpdated,
        totalUnchanged,
        totalSkipped,
        totalFailed,
        totalStockOut
      },
      brandResults
    });
  }

  logger.info('\n════════════════════════════════════════');
  logger.success(`Scrape Complete in ${(durationMs / 1000).toFixed(1)}s`);
  logger.info(`New: ${totalInserted} | Updated: ${totalUpdated} | Unchanged: ${totalUnchanged} | Out-of-stock: ${totalStockOut} | Failed: ${totalFailed}`);
  const totalQaHard     = brandResults.reduce((s, b) => s + (b.qa?.hard     ?? 0), 0);
  const totalQaSoft     = brandResults.reduce((s, b) => s + (b.qa?.soft     ?? 0), 0);
  const totalQaRepaired = brandResults.reduce((s, b) => s + (b.qa?.repaired ?? 0), 0);
  if (totalQaHard > 0 || totalQaSoft > 0) {
    logger.info(`QA: ${totalQaHard} hard issues (${totalQaRepaired} repaired by LLM), ${totalQaSoft} soft warnings`);
  }
  logger.info('════════════════════════════════════════\n');

  return { totalInserted, totalUpdated, totalUnchanged, totalSkipped, totalFailed, totalStockOut, durationMs };
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
