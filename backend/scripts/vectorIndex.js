/**
 * vectorIndex.js — create the Atlas Vector Search index on each catalog and wait until it is queryable.
 *
 *   npm run vector:index              all four catalogs (idempotent)
 *   npm run vector:index -- clothing  just one
 *   npm run vector:index -- --status  report only
 *
 * A free (M0) Atlas cluster allows 3 search indexes in total; the 4th catalog (watches, ~60 items) then keeps
 * using the in-process search automatically (VECTOR_BACKEND=auto). Index builds take a minute or two.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { CATALOGS } from '../services/crossCatalogSearch.js';
import { ensureVectorIndex, indexState, resetIndexStatus, VECTOR_INDEX_NAME } from '../services/atlasVector.js';

const args = process.argv.slice(2);
const statusOnly = args.includes('--status');
const only = args.find((a) => !a.startsWith('--'));
const wait = async (ms) => new Promise((r) => setTimeout(r, ms));

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const targets = CATALOGS.filter((c) => !only || c.key === only);
let failed = 0;

for (const { key, Model } of targets) {
  if (!statusOnly) {
    try {
      console.log(`${key.padEnd(9)} ${await ensureVectorIndex(Model)}`);
    } catch (e) {
      failed++;
      console.log(`${key.padEnd(9)} could not create the index: ${e.message.slice(0, 160)}`);
    }
  }
}
// wait for builds
const deadline = Date.now() + 10 * 60_000;
for (;;) {
  resetIndexStatus();
  const rows = [];
  for (const { key, Model } of targets) rows.push([key, await indexState(Model)]);
  console.log(rows.map(([k, s]) => `${k}: ${s.ready ? 'READY' : s.state}`).join('  |  '));
  if (statusOnly || rows.every(([, s]) => s.ready || /missing|unsupported/.test(s.state)) || Date.now() > deadline) break;
  await wait(10_000);
}
console.log(`index name: ${VECTOR_INDEX_NAME}`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
