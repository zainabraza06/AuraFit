/**
 * backfillWatchGender.js — fix watches whose stored gender disagrees with their name ("Golden Gents Watch" stored
 * as women because the collection was configured as women's). New scrapes already derive it from the name.
 *
 *   npm run backfill:watchgender            # dry run
 *   npm run backfill:watchgender -- --apply
 *
 * Gender is part of the embedding text, so run `npm run embed:all` afterwards (the changed rows are detected as stale).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { genderFromWatchName } from './scrapers/parsers/watchParser.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

/** Pure: the $set for one watch row, or null when it is already right or the name says nothing. */
export function watchGenderPatch(doc) {
  const g = genderFromWatchName(doc.name);
  return g && g !== doc.gender ? { gender: g } : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI);
  const Watch = (await import('../models/WatchProduct.js')).default;
  const docs = await Watch.find({}, 'name gender').lean();
  const ops = [];
  const changes = {};
  for (const d of docs) {
    const patch = watchGenderPatch(d);
    if (!patch) continue;
    ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: patch } } });
    const k = `${d.gender} -> ${patch.gender}`;
    changes[k] = (changes[k] || 0) + 1;
  }
  console.log(`${apply ? 'APPLY' : 'Dry run'}: ${ops.length} of ${docs.length} watches change gender`, JSON.stringify(changes));
  if (apply && ops.length) console.log(`  updated ${(await Watch.bulkWrite(ops, { ordered: false })).modifiedCount}`);
  if (!apply) console.log('Nothing changed. Re-run with --apply.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); process.exit(); });
