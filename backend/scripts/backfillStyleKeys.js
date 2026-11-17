/**
 * backfillStyleKeys.js — add styleCode / styleGroup to clothing rows that were scraped before the
 * fields existed (new scrapes set them automatically).
 *
 *   npm run backfill:stylekeys            # dry run
 *   npm run backfill:stylekeys -- --apply
 *
 * No embedding changes: the fields are not part of the embedding text.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { deriveStyleKey } from './scrapers/utils/styleKey.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

/** Pure: the $set for one row, or null when the row already has the right keys / has none to derive. */
export function styleKeyPatch(doc) {
  const k = deriveStyleKey({ name: doc.name, productUrl: doc.productUrl, brand: doc.brand });
  if (!k.styleCode) return null;
  if (doc.styleCode === k.styleCode && doc.styleGroup === k.styleGroup) return null;
  return { styleCode: k.styleCode, styleGroup: k.styleGroup };
}

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI);
  const Clothing = (await import('../models/ClothingProduct.js')).default;
  const docs = await Clothing.find({}, 'name brand productUrl styleCode styleGroup').lean();
  const ops = [];
  for (const d of docs) {
    const patch = styleKeyPatch(d);
    if (patch) ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: patch } } });
  }
  const groups = new Map();
  for (const d of docs) {
    const k = deriveStyleKey({ name: d.name, productUrl: d.productUrl, brand: d.brand });
    if (k.styleGroup) groups.set(k.styleGroup, (groups.get(k.styleGroup) || 0) + 1);
  }
  const multi = [...groups.values()].filter((n) => n > 1);
  console.log(`${apply ? 'APPLY' : 'Dry run'}: ${ops.length} of ${docs.length} clothing rows get style keys; ${groups.size} distinct designs, ${multi.length} of them sold in 2+ colours (${multi.reduce((a, b) => a + b, 0)} rows)`);
  if (apply && ops.length) {
    const res = await Clothing.bulkWrite(ops, { ordered: false });
    console.log(`  updated ${res.modifiedCount}`);
  }
  if (!apply) console.log('Nothing changed. Re-run with --apply.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); process.exit(); });
}
