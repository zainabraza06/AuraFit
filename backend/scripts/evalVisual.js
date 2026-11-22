/**
 * evalVisual.js — measure the CLIP image index (photo search), which had no quality score before.
 *
 *   npm run eval:visual                    # print results, compare with eval/baseline-visual.json
 *   npm run eval:visual -- --write-baseline
 *
 * Two measurements on the live catalog:
 *
 *  1. TEXT -> IMAGE: the golden queries (eval/golden-queries.json, same predicate judgments as eval:search) are
 *     embedded with CLIP's text tower and matched against product PHOTOS only. Same metrics as the text search, so
 *     the two can be compared. (CLIP sees pixels, not product descriptions, so lower numbers are expected.)
 *
 *  2. IMAGE -> IMAGE: for a sample of products, search with the product's own photo (itself excluded) and check
 *     that the top results are the same kind of thing: same catalog, and same product type within it
 *     (dressStyle / shoeType / jewelryType / watchType). This is what "find me something that looks like this" needs.
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
const BASELINE = path.resolve(__dirname, '../eval/baseline-visual.json');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };

const TYPE_FIELD = { clothing: 'dressStyle', shoes: 'shoeType', jewelry: 'jewelryType', watches: 'watchType' };

/** Pure: share of results that match the query product's catalog / type. */
export function similarityMetrics(queryProduct, results, k = 5) {
  const top = results.slice(0, k);
  if (!top.length) return { sameCatalog: 0, sameType: 0, n: 0 };
  const field = TYPE_FIELD[queryProduct.catalog];
  const sameCatalog = top.filter((r) => r.catalog === queryProduct.catalog).length / top.length;
  const qType = queryProduct[field];
  const sameType = qType && qType !== 'other'
    ? top.filter((r) => r.catalog === queryProduct.catalog && r[field] === qType).length / top.length
    : null; // the query product has no usable type: not scored
  return { sameCatalog, sameType, n: top.length };
}

async function main() {
  const k = Number(arg('k', 10));
  const sample = Number(arg('sample', 150));
  await mongoose.connect(process.env.MONGO_URI);
  const { CATALOGS } = await import('../services/crossCatalogSearch.js');
  const { embedTextForImages, IMAGE_EMBEDDING_MODEL_ID } = await import('../services/imageEmbeddings.js');
  const { searchByImageVector } = await import('../services/visualSearch.js');
  const { loadAllProducts } = await import('./evalSearch.js');

  // ── 1. text -> image
  const specs = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const all = await loadAllProducts();
  const perQuery = [];
  for (const spec of specs) {
    const vec = await embedTextForImages(spec.query);
    const results = await searchByImageVector(vec, { catalog: spec.catalog, limit: k });
    const withFields = results.map((r) => ({ ...r })); // searchByImageVector returns the catalog fields the predicates need
    const relevantTotal = relevantSet(all, spec).length;
    perQuery.push({ id: spec.id, metrics: queryMetrics(withFields, spec, relevantTotal, k) });
  }
  const text2img = aggregate(perQuery);

  // ── 2. image -> image
  const rows = [];
  for (const { key, Model } of CATALOGS) {
    const docs = await Model.find({ inStock: { $ne: false }, imageEmbeddingModel: IMAGE_EMBEDDING_MODEL_ID }, `+imageEmbedding ${TYPE_FIELD[key]}`).limit(2000).lean();
    // deterministic spread across the catalog (no randomness: the number must be reproducible)
    const step = Math.max(1, Math.floor(docs.length / Math.ceil(sample / CATALOGS.length)));
    for (let i = 0; i < docs.length && rows.length < sample * 2; i += step) rows.push({ ...docs[i], catalog: key });
  }
  const per = [];
  for (const q of rows.slice(0, sample)) {
    const res = (await searchByImageVector(q.imageEmbedding, { catalog: undefined, limit: 6 })).filter((r) => String(r._id) !== String(q._id));
    per.push(similarityMetrics(q, res, 5));
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const img2img = { products: per.length, sameCatalog: mean(per.map((p) => p.sameCatalog)), sameType: mean(per.map((p) => p.sameType).filter((x) => x != null)) };

  const f = (x) => (x == null ? 'n/a' : x.toFixed(3));
  console.log(`TEXT -> IMAGE (golden queries, k=${k}, ${text2img.scored}/${text2img.queries} answerable): precision ${f(text2img.precision)}  recall ${f(text2img.recall)}  MRR ${f(text2img.mrr)}  nDCG ${f(text2img.ndcg)}`);
  console.log(`IMAGE -> IMAGE (${img2img.products} product photos, top 5, query product excluded): same catalog ${f(img2img.sameCatalog)}  same product type ${f(img2img.sameType)}`);

  const summary = { k, date: new Date().toISOString().slice(0, 10), text2img: { precision: text2img.precision, recall: text2img.recall, mrr: text2img.mrr, ndcg: text2img.ndcg }, img2img };
  if (process.argv.includes('--write-baseline')) {
    fs.writeFileSync(BASELINE, `${JSON.stringify(summary, null, 2)}\n`);
    console.log('Baseline written.');
    return 0;
  }
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const bad = [
    ...regressions(text2img, base?.text2img, 0.05),
    ...(base && img2img.sameType != null && base.img2img.sameType != null && img2img.sameType < base.img2img.sameType - 0.05 ? [`image->image same-type ${f(img2img.sameType)} < baseline ${f(base.img2img.sameType)}`] : []),
  ];
  console.log(bad.length ? `\nREGRESSION:\n- ${bad.join('\n- ')}` : base ? '\nNo regression vs baseline.' : '\nNo baseline yet (run with --write-baseline).');
  return bad.length ? 2 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); process.exit(); });
}
