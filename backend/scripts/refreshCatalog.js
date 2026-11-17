/**
 * refreshCatalog.js — the weekly catalog refresh.
 *
 *   npm run refresh:catalog
 *
 * One run does everything needed to keep the catalog current:
 *   1. scrape clothing                 -> new products inserted, changed ones updated
 *   2. scrape shoes / watches / jewelry
 *      (each brand sweep marks products that vanished from the site as out of stock,
 *       unless the run looks blocked - see scrapers/utils/stockSync.js)
 *   3. embed every new or changed product with the current model (RAG vectors)
 *   4. print a summary (also written to $GITHUB_STEP_SUMMARY in CI) and exit non-zero if
 *      something looks wrong: a catalog lost most of its in-stock products, or embeddings failed.
 *
 * Scheduled by .github/workflows/weekly-refresh.yml.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CATALOGS = [
  ['clothing', 'clothingproducts'],
  ['shoes', 'shoeproducts'],
  ['jewelry', 'jewelryproducts'],
  ['watches', 'watchproducts'],
];

/** Counts per catalog: total, in stock, out of stock, and rows without a current-model vector. */
export async function snapshotCatalogs(db, modelId) {
  const out = {};
  for (const [label, col] of CATALOGS) {
    const c = db.collection(col);
    const [total, inStock, stale] = await Promise.all([
      c.countDocuments({}),
      c.countDocuments({ inStock: { $ne: false } }),
      c.countDocuments({ inStock: { $ne: false }, $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }, { embeddingModel: { $ne: modelId } }] }),
    ]);
    out[label] = { total, inStock, outOfStock: total - inStock, unembedded: stale };
  }
  return out;
}

/**
 * Problems worth failing the job for. Pure, so it is unit-tested.
 * @returns {string[]} human-readable problems (empty = healthy)
 */
export function findProblems(before, after, { embedFailed = 0, minKeepRatio = 0.5, minBaseline = 20 } = {}) {
  const problems = [];
  for (const label of Object.keys(after)) {
    const b = before[label]?.inStock ?? 0;
    const a = after[label].inStock;
    if (b >= minBaseline && a < b * minKeepRatio) {
      problems.push(`${label}: in-stock products fell from ${b} to ${a} (more than ${Math.round((1 - minKeepRatio) * 100)}% drop) - the scrape may have been blocked`);
    }
    if (after[label].unembedded > 0) problems.push(`${label}: ${after[label].unembedded} in-stock products still have no current embedding`);
  }
  if (embedFailed > 0) problems.push(`${embedFailed} embedding(s) failed`);
  return problems;
}

export function renderSummary(before, after, problems, minutes) {
  const rows = Object.keys(after).map((l) => {
    const b = before[l];
    const a = after[l];
    return `| ${l} | ${a.total} (${a.total - b.total >= 0 ? '+' : ''}${a.total - b.total}) | ${a.inStock} (${a.inStock - b.inStock >= 0 ? '+' : ''}${a.inStock - b.inStock}) | ${a.outOfStock} | ${a.unembedded} |`;
  });
  return [
    `## Weekly catalog refresh (${minutes} min)`,
    '',
    '| catalog | total | in stock | out of stock | missing embedding |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    problems.length ? `**Problems**\n${problems.map((p) => `- ${p}`).join('\n')}` : 'No problems detected.',
    '',
  ].join('\n');
}

export async function refreshCatalog() {
  const started = Date.now();
  const { EMBEDDING_MODEL_ID } = await import('../services/embeddings.js');
  const { runScraper } = await import('./scrapers/index.js');
  const { runVerticalScraper } = await import('./scrapers/runVertical.js');
  const { embedAllCatalogs } = await import('../services/embeddingJobs.js');
  const { embedAllImages } = await import('../services/imageEmbeddingJobs.js');

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const before = await snapshotCatalogs(db, EMBEDDING_MODEL_ID);

  console.log('\n=== 1/4 clothing ===');
  await runScraper({ triggeredBy: 'weekly' });
  for (const v of ['shoes', 'watches', 'jewelry']) {
    console.log(`\n=== 2/4 ${v} ===`);
    await runVerticalScraper(v);
  }

  console.log('\n=== 3/4 text embeddings ===');
  const embedResults = await embedAllCatalogs();
  const embedFailed = Object.values(embedResults).reduce((n, r) => n + r.failed, 0);

  // Picture vectors (CLIP) for new/changed photos. A few unreachable images are normal (retailer CDN hiccups)
  // and only reported; if more than 10% fail something systematic is wrong, so that fails the run.
  console.log('\n=== 4/4 image embeddings ===');
  const imageResults = await embedAllImages({ log: console.log });
  const imgScanned = Object.values(imageResults).reduce((n, r) => n + r.scanned, 0);
  const imgSkipped = Object.values(imageResults).reduce((n, r) => n + r.skipped, 0);
  console.log(`images: ${imgScanned - imgSkipped} embedded, ${imgSkipped} skipped of ${imgScanned}`);

  const after = await snapshotCatalogs(db, EMBEDDING_MODEL_ID);
  const problems = findProblems(before, after, { embedFailed });
  if (imgScanned >= 20 && imgSkipped / imgScanned > 0.1) problems.push(`${imgSkipped} of ${imgScanned} product images could not be embedded (>10%)`);
  const summary = renderSummary(before, after, problems, Math.round((Date.now() - started) / 60000));
  console.log('\n' + summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  return { before, after, problems };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  refreshCatalog()
    .then(({ problems }) => { process.exitCode = problems.length ? 2 : 0; })
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(async () => { await mongoose.disconnect(); process.exit(); });
}
