/**
 * benchVectors.js — how slow is brute-force cosine search, and when does it stop being OK?
 *
 *   npm run bench:vectors
 *
 * Synthetic unit vectors (no database, no model). Measures the same inner loop the API uses
 * (cosineSimilarity over Float32Array) at several catalog sizes and dimensions, then the full
 * "score + top-k" cost. A vector index (Atlas Vector Search / pgvector / Qdrant) is worth adding only
 * once p95 here, plus the rest of the request, no longer fits the latency budget.
 */
import { cosineSimilarity } from '../services/crossCatalogSearch.js';

function randomUnit(dim) {
  const v = new Float32Array(dim);
  let n = 0;
  for (let i = 0; i < dim; i++) { v[i] = Math.random() - 0.5; n += v[i] * v[i]; }
  n = Math.sqrt(n);
  for (let i = 0; i < dim; i++) v[i] /= n;
  return v;
}

function bench(size, dim, runs = 15) {
  const docs = Array.from({ length: size }, () => randomUnit(dim));
  const q = randomUnit(dim);
  const times = [];
  for (let r = 0; r < runs + 3; r++) {
    const t0 = process.hrtime.bigint();
    const scored = new Array(size);
    for (let i = 0; i < size; i++) scored[i] = { i, s: cosineSimilarity(q, docs[i]) };
    scored.sort((a, b) => b.s - a.s);
    scored.length = 20;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (r >= 3) times.push(ms); // first runs warm the JIT
  }
  times.sort((a, b) => a - b);
  return { p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)] };
}

console.log('rows      dims   p50 ms   p95 ms   memory (MB)');
for (const dim of [256, 1024]) {
  for (const size of [3_400, 20_000, 100_000]) {
    const { p50, p95 } = bench(size, dim, size > 50_000 ? 6 : 15);
    console.log(`${String(size).padStart(7)}  ${String(dim).padStart(5)}  ${p50.toFixed(1).padStart(7)}  ${p95.toFixed(1).padStart(7)}   ${((size * dim * 4) / 1e6).toFixed(0).padStart(6)}`);
  }
}
