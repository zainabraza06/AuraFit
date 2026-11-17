/**
 * repairCatalog.js — fix text already stored in the catalog.
 *
 * Currently: decode leaked HTML entities / tags in `name` and `description`
 * (e.g. "Neckline &amp; Sleeve"), using the same cleaner the scrapers now use.
 *
 * SAFE BY DEFAULT: prints what would change and writes nothing.
 *   npm run repair:catalog              # dry run, shows counts + samples
 *   npm run repair:catalog -- --apply   # actually write the changes
 *
 * Only `name` and `description` are touched. Embeddings are NOT regenerated here;
 * after --apply run `npm run embed:clothing` / `embed:accessories` so vectors
 * match the cleaned text.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { stripHtml, cleanName } from './scrapers/utils/textClean.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const DIRTY = /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);|<[a-z/][^>]*>|\u00a0/i;

/** Pure: returns the $set patch for one document, or null if nothing changes. */
export function repairPatch(doc) {
  const patch = {};
  const name = cleanName(doc.name);
  // cleanName also un-shouts ALL-CAPS titles, so a differing result is a repair whether or not entities were present
  if (doc.name && name && name !== doc.name) patch.name = name;
  const description = stripHtml(doc.description, 2000);
  if (doc.description && DIRTY.test(doc.description) && description !== doc.description) patch.description = description;
  return Object.keys(patch).length ? patch : null;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const models = {
    clothing: (await import('./../models/ClothingProduct.js')).default,
    shoes: (await import('./../models/ShoeProduct.js')).default,
    jewelry: (await import('./../models/JewelryProduct.js')).default,
    watches: (await import('./../models/WatchProduct.js')).default,
  };

  console.log(APPLY ? 'MODE: APPLY (writing)\n' : 'MODE: dry run (nothing is written; add --apply to write)\n');
  let total = 0;
  for (const [label, Model] of Object.entries(models)) {
    const docs = await Model.find({}, 'name description').lean();
    const ops = [];
    const samples = [];
    for (const d of docs) {
      const patch = repairPatch(d);
      if (!patch) continue;
      ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: patch } } });
      if (samples.length < 3) samples.push({ before: (d.description || d.name).match(/.{0,30}(&[#a-z0-9]+;|<[a-z][^>]*>).{0,20}/i)?.[0], after: (patch.description || patch.name || '').slice(0, 60) });
    }
    console.log(`${label}: ${ops.length} of ${docs.length} rows need repair`);
    samples.forEach((s) => console.log(`   e.g. ${JSON.stringify(s.before)}`));
    if (APPLY && ops.length) {
      const res = await Model.bulkWrite(ops, { ordered: false });
      console.log(`   wrote ${res.modifiedCount} rows`);
    }
    total += ops.length;
  }
  console.log(`\n${total} rows ${APPLY ? 'repaired' : 'would be repaired'}.`);
  await mongoose.disconnect();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
