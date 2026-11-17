/**
 * evalSearch.js — run the golden queries through the REAL retrieval path and report quality.
 *
 *   npm run eval:search                      # print a table + aggregate
 *   npm run eval:search -- --write-baseline  # store current aggregate in eval/baseline.json
 *   npm run eval:search -- --k 10 --tolerance 0.05
 *
 * Exits 2 when an aggregate metric drops more than the tolerance below eval/baseline.json.
 * Judgments are predicates (eval/golden-queries.json), so this keeps working after every catalog refresh.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { relevantSet, queryMetrics, aggregate, regressions } from '../services/searchEval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GOLDEN = path.resolve(__dirname, '../eval/golden-queries.json');
const BASELINE = path.resolve(__dirname, '../eval/baseline.json');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};

export async function loadAllProducts() {
  const { CATALOGS } = await import('../services/crossCatalogSearch.js');
  const all = [];
  for (const { key, Model } of CATALOGS) {
    const docs = await Model.find({ inStock: { $ne: false } }, 'name description tags dressStyle subCategory shoeType jewelryType watchType category primaryColor primaryExactColor colors exactColors').lean();
    docs.forEach((d) => all.push({ ...d, catalog: key }));
  }
  return all;
}

export async function runEval({ k = 10, specs, log = console.log } = {}) {
  const { getEmbedding, searchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  const { analyzeSearchQuery, buildSemanticQueryText } = await import('../services/searchQueryIntel.js');
  const all = await loadAllProducts();
  const perQuery = [];

  for (const spec of specs) {
    const signals = analyzeSearchQuery(spec.query);
    const embedding = await getEmbedding(buildSemanticQueryText(signals));
    const { results } = await searchAcrossCatalogs(signals, embedding, { limit: k });
    const relevantTotal = relevantSet(all, spec).length;
    const metrics = queryMetrics(results, spec, relevantTotal, k);
    perQuery.push({ id: spec.id, query: spec.query, metrics, top: results[0]?.name });
    log(`${spec.id.padEnd(22)} rel=${String(relevantTotal).padStart(4)}  P@${k}=${metrics.precision.toFixed(2)}  R=${metrics.recall == null ? '  - ' : metrics.recall.toFixed(2)}  RR=${metrics.rr.toFixed(2)}  nDCG=${metrics.ndcg == null ? '  - ' : metrics.ndcg.toFixed(2)}  | ${String(results[0]?.name || '').slice(0, 40)}`);
  }
  return { perQuery, summary: aggregate(perQuery) };
}

async function main() {
  const specs = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const k = Number(arg('k', 10));
  const tolerance = Number(arg('tolerance', 0.05));
  await mongoose.connect(process.env.MONGO_URI);

  const { summary } = await runEval({ k, specs });
  const f = (x) => (x == null ? 'n/a' : x.toFixed(3));
  console.log(`\nAGGREGATE over ${summary.scored}/${summary.queries} answerable queries (k=${k}): precision ${f(summary.precision)}  recall ${f(summary.recall)}  MRR ${f(summary.mrr)}  nDCG ${f(summary.ndcg)}`);
  if (summary.unanswerable.length) console.log(`No relevant product exists in the catalog for: ${summary.unanswerable.join(', ')} (not scored)`);

  if (process.argv.includes('--write-baseline')) {
    fs.writeFileSync(BASELINE, `${JSON.stringify({ k, date: new Date().toISOString().slice(0, 10), ...summary }, null, 2)}\n`);
    console.log(`Baseline written to ${path.relative(process.cwd(), BASELINE)}`);
    return 0;
  }
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const bad = regressions(summary, baseline, tolerance);
  if (bad.length) {
    console.log(`\nREGRESSION vs baseline:\n- ${bad.join('\n- ')}`);
    return 2;
  }
  console.log(baseline ? '\nNo regression vs baseline.' : '\nNo baseline yet (run with --write-baseline).');
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(async () => { await mongoose.disconnect(); process.exit(); });
}
