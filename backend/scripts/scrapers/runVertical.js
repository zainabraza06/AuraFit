/**
 * Vertical scraper runner: shoes | watches | jewelry | clothing | all
 *
 * Usage:
 *   node scripts/scrapers/runVertical.js shoes
 *   SCRAPER_DRY_RUN=true node scripts/scrapers/runVertical.js all
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import connectDB from '../../config/db.js';
import ClothingProduct from '../../models/ClothingProduct.js';
import ShoeProduct from '../../models/ShoeProduct.js';
import WatchProduct from '../../models/WatchProduct.js';
import JewelryProduct from '../../models/JewelryProduct.js';
import logger from './utils/logger.js';

import { CLOTHING_BRANDS } from './config/clothingBrands.js';
import { SHOE_BRANDS } from './config/shoeBrands.js';
import { WATCH_BRANDS } from './config/watchBrands.js';
import { JEWELRY_BRANDS } from './config/jewelryBrands.js';

import { BeechtreeAdapter } from './adapters/BeechtreeAdapter.js';
import { LimelightAdapter } from './adapters/LimelightAdapter.js';
import { ZellburyAdapter } from './adapters/ZellburyAdapter.js';
import { AlkaramAdapter } from './adapters/AlkaramAdapter.js';
import { GulAhmedAdapter } from './adapters/GulAhmedAdapter.js';
import { MariaBAdapter } from './adapters/MariaBAdapter.js';
import { SanaSafinazAdapter } from './adapters/SanaSafinazAdapter.js';
import { ElanAdapter } from './adapters/ElanAdapter.js';
import { ShopifyGenericAdapter } from './adapters/ShopifyGenericAdapter.js';

import { StyloAdapter } from './adapters/StyloAdapter.js';
import { ECSAdapter } from './adapters/ECSAdapter.js';
import { BorjanAdapter } from './adapters/BorjanAdapter.js';
import { HushPuppiesAdapter } from './adapters/HushPuppiesAdapter.js';
import { NdureAdapter } from './adapters/NdureAdapter.js';

import { BaseAdapter } from './adapters/BaseAdapter.js';
import { WATCH_ADAPTER_HOOKS } from './parsers/watchParser.js';
import { JEWELRY_ADAPTER_HOOKS } from './parsers/jewelryParser.js';

const CLOTHING_ADAPTERS = {
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

const SHOE_ADAPTERS = {
  StyloAdapter,
  ECSAdapter,
  BorjanAdapter,
  HushPuppiesAdapter,
  NdureAdapter
};

class WatchBrandAdapter extends BaseAdapter {
  constructor(cfg) {
    super(cfg, WATCH_ADAPTER_HOOKS);
  }
}

class JewelryBrandAdapter extends BaseAdapter {
  constructor(cfg) {
    super(cfg, JEWELRY_ADAPTER_HOOKS);
  }
}

const WATCH_ADAPTERS = { WatchBrandAdapter };
const JEWELRY_ADAPTERS = { JewelryBrandAdapter };

const MODEL_BY_VERTICAL = {
  clothing: ClothingProduct,
  shoes: ShoeProduct,
  watches: WatchProduct,
  jewelry: JewelryProduct
};

async function upsertToModel(Model, product) {
  const doc = await Model.findOneAndUpdate(
    { productUrl: product.productUrl },
    { $set: product },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const age = Date.now() - new Date(doc.scrapedAt || doc.createdAt).getTime();
  return age < 15000 ? 'inserted' : 'updated';
}

async function runOneVertical(vertical, dryRun) {
  const map = {
    clothing: { brands: CLOTHING_BRANDS, adapters: CLOTHING_ADAPTERS },
    shoes: { brands: SHOE_BRANDS, adapters: SHOE_ADAPTERS },
    watches: { brands: WATCH_BRANDS, adapters: WATCH_ADAPTERS },
    jewelry: { brands: JEWELRY_BRANDS, adapters: JEWELRY_ADAPTERS }
  };
  const cfg = map[vertical];
  if (!cfg) throw new Error(`Unknown vertical: ${vertical}`);

  const Model = MODEL_BY_VERTICAL[vertical];
  let totalInserted = 0, totalUpdated = 0, totalSkipped = 0, totalFailed = 0;

  for (const brandConfig of cfg.brands) {
    const AdapterClass = cfg.adapters[brandConfig.adapter];
    if (!AdapterClass) {
      logger.warn(`No adapter ${brandConfig.adapter} for ${vertical}`);
      continue;
    }
    const adapter = new AdapterClass(brandConfig);
    logger.info(`\n▶ [${vertical}] ${brandConfig.brand}`);

    const collectionResults = await adapter.scrapeAll();
    let ins = 0, upd = 0, skp = 0, fail = 0;

    for (const result of collectionResults) {
      if (result.strategy === 'failed') {
        fail++;
        continue;
      }
      for (const product of result.products) {
        if (dryRun) {
          logger.info(`[DRY][${vertical}] ${product.name} | PKR ${product.price}`);
          ins++;
          continue;
        }
        try {
          const out = await upsertToModel(Model, product);
          if (out === 'inserted') ins++;
          else upd++;
        } catch (err) {
          logger.error(`DB upsert failed [${vertical}]: ${product.productUrl}`, err.message);
          skp++;
        }
      }
    }
    totalInserted += ins;
    totalUpdated += upd;
    totalSkipped += skp;
    totalFailed += fail;
    logger.success(`✓ [${vertical}] ${brandConfig.brand}: +${ins} inserted, ~${upd} updated, ✗${fail} failed`);
  }

  return { totalInserted, totalUpdated, totalSkipped, totalFailed };
}

export async function runVerticalScraper(vertical = 'clothing', opts = {}) {
  const dryRun = String(process.env.SCRAPER_DRY_RUN || opts.dryRun || '').toLowerCase() === 'true';
  const runId = new Date().toISOString();
  logger.info(`Vertical scraper — ${vertical} | dryRun=${dryRun} | ${runId}`);

  if (!dryRun) await connectDB();

  const order =
    vertical === 'all'
      ? ['clothing', 'shoes', 'watches', 'jewelry']
      : [vertical];

  let sum = { totalInserted: 0, totalUpdated: 0, totalSkipped: 0, totalFailed: 0 };
  for (const v of order) {
    const r = await runOneVertical(v, dryRun);
    sum.totalInserted += r.totalInserted;
    sum.totalUpdated += r.totalUpdated;
    sum.totalSkipped += r.totalSkipped;
    sum.totalFailed += r.totalFailed;
  }

  logger.success(
    `Done [${vertical}]: Inserted ${sum.totalInserted} | Updated ${sum.totalUpdated} | Skipped ${sum.totalSkipped} | Failed ${sum.totalFailed}`
  );
  return sum;
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const vertical = (process.argv[2] || 'shoes').toLowerCase();
  runVerticalScraper(vertical)
    .then(() => process.exit(0))
    .catch((e) => {
      logger.error(e.message);
      process.exit(1);
    });
}
