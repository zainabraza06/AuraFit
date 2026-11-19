/**
 * purgeMisclassified.js — remove accessory rows that are really something else
 * (clothing, footwear, bags, scarves, fragrance) from the jewelry, watches and shoes catalogs.
 *
 *   npm run purge:misclassified            # dry run: lists what would be deleted
 *   npm run purge:misclassified -- --apply # delete them
 *
 * Uses the same name rules the scrapers now apply (parsers/jewelryParser.js, parsers/watchParser.js),
 * so rows the parser would reject today are exactly the rows removed here.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { isNonJewelryName } from './scrapers/parsers/jewelryParser.js';
import { isNonWatchName } from './scrapers/parsers/watchParser.js';
import { isNonShoeName } from './scrapers/parsers/shoeParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** Pure: which of these rows should go. `kind` is 'jewelry', 'watches' or 'shoes'. */
export function findMisclassified(rows, kind = 'jewelry') {
  const test = kind === 'watches' ? isNonWatchName : kind === 'shoes' ? isNonShoeName : isNonJewelryName;
  return rows.filter((r) => test(r.name));
}

async function purge(label, Model, apply) {
  const rows = await Model.find({}, 'brand name').lean();
  const bad = findMisclassified(rows, label);
  const byBrand = {};
  bad.forEach((r) => (byBrand[r.brand] = (byBrand[r.brand] || 0) + 1));
  console.log(`${apply ? 'APPLY' : 'Dry run'} [${label}]: ${bad.length} of ${rows.length} rows are not ${label}`, JSON.stringify(byBrand));
  bad.slice(0, 12).forEach((r) => console.log(`  - ${r.brand}: ${r.name.slice(0, 70)}`));
  if (apply && bad.length) {
    const res = await Model.deleteMany({ _id: { $in: bad.map((r) => r._id) } });
    console.log(`  deleted ${res.deletedCount}`);
  }
  return bad.length;
}

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI);
  const Jewelry = (await import('../models/JewelryProduct.js')).default;
  const Watch = (await import('../models/WatchProduct.js')).default;
  const Shoe = (await import('../models/ShoeProduct.js')).default;
  await purge('jewelry', Jewelry, apply);
  await purge('watches', Watch, apply);
  await purge('shoes', Shoe, apply);
  if (!apply) console.log('\nNothing changed. Re-run with --apply to delete.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(async () => { await mongoose.disconnect(); process.exit(); });
}
