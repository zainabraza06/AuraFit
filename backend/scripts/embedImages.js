/**
 * embedImages.js — compute CLIP image vectors for every in-stock product photo (resumable).
 *
 *   npm run embed:images                 # only products missing / stale
 *   npm run embed:images -- --limit 200  # a small batch first
 *   npm run embed:images -- --force      # recompute everything
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { embedAllImages } from '../services/imageEmbeddingJobs.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };

await mongoose.connect(process.env.MONGO_URI);
const t0 = Date.now();
const summary = await embedAllImages({
  limit: Number(arg('limit', Infinity)),
  concurrency: Number(arg('concurrency', 6)),
  force: process.argv.includes('--force'),
  log: console.log,
});
for (const [catalog, r] of Object.entries(summary)) {
  console.log(`${catalog.padEnd(9)} scanned ${String(r.scanned).padStart(5)}  embedded ${String(r.embedded).padStart(5)}  skipped ${String(r.skipped).padStart(4)}`);
  r.failures.slice(0, 3).forEach((f) => console.log(`   ! ${f}`));
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await mongoose.disconnect();
process.exit(0);
