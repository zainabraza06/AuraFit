/**
 * loadTestApi.js — load test the REAL API (real routes, real database) and check it against latency targets.
 *
 *   npm run load:api                       # default scenarios
 *   npm run load:api -- --connections 40 --duration 15
 *
 * Starts the app in-process on a random port, warms the search caches (model + vectors), then drives each
 * scenario with autocannon. Prints RPS and p50/p95/p99 and exits 2 if a p95 target or the error budget is
 * breached. Use a quiet machine: other CPU-heavy jobs (embedding, scraping) skew the numbers.
 *
 * Targets (p95, per scenario) are a starting SLO for one API instance; they live in SCENARIOS below.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import autocannon from 'autocannon';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
process.env.NODE_ENV = 'loadtest'; // rate limiter off (see app.js); this measures the app itself
process.env.LOG_REQUESTS = 'false';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const connections = Number(arg('connections', 20));
const duration = Number(arg('duration', 10));

const QUERIES = ['red lawn suit', 'white kurta for eid', 'black heels for a party', 'gold jhumka earrings', 'navy blue formal dress', 'pearl necklace', 'kids watch', 'green mehndi outfit'];
const q = (i) => encodeURIComponent(QUERIES[i % QUERIES.length]);

/** p95Ms = target. `requests` rotate so caches are exercised realistically but not trivially. */
export const SCENARIOS = [
  { name: 'health', p95Ms: 50, requests: [{ method: 'GET', path: '/api/health' }] },
  { name: 'browse (cached list)', p95Ms: 150, requests: [{ method: 'GET', path: '/api/products?limit=24' }] },
  { name: 'featured (cached)', p95Ms: 150, requests: [{ method: 'GET', path: '/api/products/featured' }] },
  { name: 'keyword search (cached)', p95Ms: 400, requests: QUERIES.map((s) => ({ method: 'GET', path: `/api/search?q=${encodeURIComponent(s.split(' ')[1])}` })) },
  // Unique query every time => always a cache miss: the true cost of a never-seen search. It is dominated by round trips to the
  // database, so on a laptop talking to Atlas over the internet it is informational (no target), not a pass/fail gate.
  { name: 'keyword search (uncached)', p95Ms: null, requests: Array.from({ length: 40 }, (_, i) => ({ method: 'GET', path: `/api/search?q=${encodeURIComponent(QUERIES[i % QUERIES.length].split(' ')[1])}&nocache=${i}` })) },
  { name: 'semantic search (warm)', p95Ms: 800, requests: QUERIES.map((_, i) => ({ method: 'GET', path: `/api/search/semantic?q=${q(i)}&limit=20` })) },
];
const MAX_ERROR_RATE = 0.01;

function run(opts) {
  return new Promise((resolve, reject) => autocannon(opts, (err, res) => (err ? reject(err) : resolve(res))));
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const { createApp } = await import('../app.js');
  const { warmUpSearch } = await import('../services/searchWarmup.js');
  const app = createApp();
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  console.log('warming search (loads the embedding model and candidate vectors)...');
  const warm = await warmUpSearch({ log: () => {} });
  console.log(warm.ok ? `  warm in ${(warm.ms / 1000).toFixed(1)} s, ${warm.candidates} candidates` : `  warm-up skipped: ${warm.skipped || warm.error}`);
  // prime each semantic query once so embedding-cache effects are the steady state a real site would see
  for (const s of QUERIES) await fetch(`${base}/api/search/semantic?q=${encodeURIComponent(s)}&limit=20`).then((r) => r.arrayBuffer());

  console.log(`\n${connections} connections x ${duration} s per scenario\n`);
  console.log('scenario                    req/s    p50     p95     p99    errors   target p95');
  const failures = [];
  const rows = [];
  for (const sc of SCENARIOS) {
    const res = await run({ url: base, connections, duration, requests: sc.requests, headers: { 'x-forwarded-for': '10.0.0.1' } });
    const total = res.requests.total || 1;
    const bad = res.errors + res.timeouts + (res.non2xx || 0);
    const rate = bad / total;
    const row = { name: sc.name, rps: Math.round(res.requests.average), p50: res.latency.p50, p95: res.latency.p97_5 ?? res.latency.p95 ?? res.latency.p99, p99: res.latency.p99, errors: bad, rate, target: sc.p95Ms };
    // autocannon reports p97.5; use the closest percentile at/above 95 and say so in the header
    rows.push(row);
    console.log(`${sc.name.padEnd(26)} ${String(row.rps).padStart(6)}  ${String(row.p50).padStart(5)}ms ${String(row.p95).padStart(6)}ms ${String(row.p99).padStart(6)}ms  ${String(bad).padStart(5)}   ${sc.p95Ms == null ? 'informational' : `<= ${sc.p95Ms} ms`}`);
    if (sc.p95Ms != null && row.p95 > sc.p95Ms) failures.push(`${sc.name}: p97.5 ${row.p95} ms > target ${sc.p95Ms} ms`);
    if (rate > MAX_ERROR_RATE) failures.push(`${sc.name}: error rate ${(rate * 100).toFixed(1)}% > ${MAX_ERROR_RATE * 100}% (${bad}/${total} bad, e.g. non-2xx: ${res.non2xx})`);
  }
  console.log('\n(latency percentile reported = p97.5, the closest autocannon exposes above p95)');
  server.close();
  await mongoose.disconnect();
  if (failures.length) {
    console.log(`\nTARGETS MISSED:\n- ${failures.join('\n- ')}`);
    return 2;
  }
  console.log('\nAll scenarios within target.');
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
}
