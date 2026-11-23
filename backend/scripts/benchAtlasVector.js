/**
 * benchAtlasVector.js — is Atlas Vector Search (approximate, HNSW) as good as exact search, and how fast is it?
 *
 *   npm run bench:atlas
 *
 * Queries are the stored vectors of random in-stock products (no embedding model needed). For each catalog with a
 * ready index it measures
 *   recall@K   overlap between the approximate top-K and the EXACT top-K ($vectorSearch with exact:true)
 *   latency    median / p95 of the approximate query, round trip to Atlas included
 * (the network round trip dominates: this cluster is not on this machine).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { CATALOGS } from '../services/crossCatalogSearch.js';
import { buildPipeline, buildFilter, indexState } from '../services/atlasVector.js';
import { EMBEDDING_MODEL_ID } from '../services/embeddings.js';

const K = 20;
const QUERIES = Number(process.argv.find((a) => a.startsWith('--queries='))?.split('=')[1] || 30);
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
console.log(`K=${K}, ${QUERIES} queries per catalog, numCandidates = 60 x K\n`);
console.log('catalog    docs   recall@20  p50 ms  p95 ms');

for (const { key, Model } of CATALOGS) {
  if (!(await indexState(Model)).ready) { console.log(`${key.padEnd(9)}  (no vector index: served in-process)`); continue; }
  const filter = buildFilter({ modelField: 'embeddingModel', modelId: EMBEDDING_MODEL_ID });
  const sample = await Model.aggregate([{ $match: { inStock: { $ne: false }, embeddingModel: EMBEDDING_MODEL_ID } }, { $sample: { size: QUERIES } }, { $project: { embedding: 1 } }]);
  const docs = await Model.countDocuments({ inStock: { $ne: false }, embeddingModel: EMBEDDING_MODEL_ID });
  const recalls = [];
  const times = [];
  for (const q of sample) {
    const t0 = performance.now();
    const ann = await Model.aggregate(buildPipeline({ path: 'embedding', vector: q.embedding, filter, limit: K, numCandidates: K * 60, projection: { _id: 1 } }));
    times.push(performance.now() - t0);
    const exact = await Model.aggregate(buildPipeline({ path: 'embedding', vector: q.embedding, filter, limit: K, exact: true, projection: { _id: 1 } }));
    const truth = new Set(exact.map((d) => String(d._id)));
    recalls.push(ann.filter((d) => truth.has(String(d._id))).length / Math.max(1, truth.size));
  }
  const mean = recalls.reduce((a, b) => a + b, 0) / recalls.length;
  console.log(`${key.padEnd(9)}  ${String(docs).padStart(5)}   ${mean.toFixed(3)}      ${pct(times, 50).toFixed(0).padStart(5)}   ${pct(times, 95).toFixed(0).padStart(5)}`);
}
await mongoose.disconnect();
