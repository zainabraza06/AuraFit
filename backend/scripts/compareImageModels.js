/**
 * compareImageModels.js — is a fashion-tuned CLIP better than the general one for THIS catalog?
 *
 *   npm run compare:clip                      # default 200 products per catalog
 *   npm run compare:clip -- --per-catalog 120
 *
 * Every model sees the SAME deterministic sample of live product photos (downloaded once) and is scored with the
 * SAME metrics, so the numbers are comparable:
 *   - text -> photo: the golden queries (eval/golden-queries.json), predicate-judged against the sample
 *   - photo -> photo: top-5 neighbours of each sample photo: same catalog, same product type
 * Nothing is written to the database. Models that fail to load are reported, not hidden.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { safeGetBuffer } from '../utils/safeFetch.js';
import { createClipBackend } from '../services/imageEmbeddings.js';
import { relevantSet, queryMetrics, aggregate } from '../services/searchEval.js';
import { similarityMetrics } from './evalVisual.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MODELS = [
  { label: 'CLIP ViT-B/32 (current, general)', repo: 'Xenova/clip-vit-base-patch32', dtype: 'q8' },
  { label: 'FashionCLIP (ViT-B/32, fashion-tuned)', repo: 'ff13/fashion-clip', dtype: 'q8' },
  { label: 'Marqo-FashionCLIP (ViT-B/16, fashion-tuned)', repo: 'Marqo/marqo-fashionCLIP', dtype: 'q8' },
];
const TYPE_FIELD = { clothing: 'dressStyle', shoes: 'shoeType', jewelry: 'jewelryType', watches: 'watchType' };
const FIELDS = 'name description tags dressStyle subCategory shoeType jewelryType watchType category primaryColor primaryExactColor colors exactColors imageUrl images';

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function sampleProducts(perCatalog) {
  const { CATALOGS } = await import('../services/crossCatalogSearch.js');
  const out = [];
  for (const { key, Model } of CATALOGS) {
    const docs = await Model.find({ inStock: { $ne: false } }, FIELDS).sort({ _id: 1 }).lean();
    const withImg = docs.filter((d) => d.imageUrl || d.images?.[0]);
    const step = Math.max(1, Math.floor(withImg.length / perCatalog));
    for (let i = 0; i < withImg.length && out.filter((p) => p.catalog === key).length < perCatalog; i += step) out.push({ ...withImg[i], catalog: key });
  }
  return out;
}

async function downloadAll(products, concurrency = 8) {
  const buffers = new Map();
  let next = 0;
  const worker = async () => {
    while (next < products.length) {
      const p = products[next++];
      try { buffers.set(String(p._id), (await safeGetBuffer(p.imageUrl || p.images[0], { timeout: 20000 })).data); } catch { /* skipped, same for every model */ }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return buffers;
}

async function evaluate(model, products, buffers, specs, k = 10) {
  const backend = createClipBackend({ repo: model.repo, dtype: model.dtype });
  const t0 = Date.now();
  const usable = products.filter((p) => buffers.has(String(p._id)));
  const vecs = new Map();
  for (const p of usable) vecs.set(String(p._id), await backend.embedImage(buffers.get(String(p._id))));
  const embedSeconds = (Date.now() - t0) / 1000;

  // text -> photo, judged only on queries that have >= 3 relevant products inside the sample (smaller sets are noise)
  const perQuery = [];
  for (const spec of specs) {
    const pool = usable.filter((p) => !spec.catalog || p.catalog === spec.catalog);
    const relevantTotal = relevantSet(pool, spec).length;
    if (relevantTotal < 3) continue;
    const q = await backend.embedText(spec.query);
    const ranked = pool.map((p) => ({ p, s: dot(q, vecs.get(String(p._id))) })).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.p);
    perQuery.push({ id: spec.id, metrics: queryMetrics(ranked, spec, relevantTotal, k) });
  }
  const text2img = aggregate(perQuery);

  // photo -> photo
  const per = [];
  for (const q of usable) {
    const ranked = usable.filter((p) => p !== q).map((p) => ({ p, s: dot(vecs.get(String(q._id)), vecs.get(String(p._id))) })).sort((a, b) => b.s - a.s).slice(0, 5).map((x) => x.p);
    per.push(similarityMetrics(q, ranked, 5));
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    photos: usable.length, embedSeconds: Math.round(embedSeconds),
    queriesScored: text2img.scored, text2img: { precision: text2img.precision, recall: text2img.recall, mrr: text2img.mrr, ndcg: text2img.ndcg },
    img2img: { sameCatalog: mean(per.map((x) => x.sameCatalog)), sameType: mean(per.map((x) => x.sameType).filter((x) => x != null)) },
  };
}

async function main() {
  const perCatalog = Number(arg('per-catalog', 200));
  await mongoose.connect(process.env.MONGO_URI);
  const specs = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../eval/golden-queries.json'), 'utf8'));
  const products = await sampleProducts(perCatalog);
  console.log(`sample: ${products.length} products (${['clothing', 'shoes', 'jewelry', 'watches'].map((c) => `${c} ${products.filter((p) => p.catalog === c).length}`).join(', ')}); downloading photos...`);
  const buffers = await downloadAll(products);
  console.log(`downloaded ${buffers.size}/${products.length}\n`);

  const results = [];
  for (const model of MODELS) {
    process.stdout.write(`evaluating ${model.label} ... `);
    try {
      const r = await evaluate(model, products, buffers, specs);
      results.push({ ...model, ...r });
      console.log(`done (${r.embedSeconds}s)`);
    } catch (e) {
      results.push({ ...model, error: String(e.message).slice(0, 160) });
      console.log(`FAILED: ${String(e.message).slice(0, 120)}`);
    }
  }
  const f = (x) => (x == null ? ' n/a ' : x.toFixed(3));
  console.log('\nmodel                                         photos  text->photo (P@10  R  MRR  nDCG)      photo->photo (same catalog / same type)');
  for (const r of results) {
    if (r.error) { console.log(`${r.label.padEnd(44)}  ${r.error}`); continue; }
    console.log(`${r.label.padEnd(44)}  ${String(r.photos).padStart(5)}   ${f(r.text2img.precision)} ${f(r.text2img.recall)} ${f(r.text2img.mrr)} ${f(r.text2img.ndcg)}   (${r.queriesScored} queries)      ${f(r.img2img.sameCatalog)} / ${f(r.img2img.sameType)}`);
  }
  fs.writeFileSync(path.resolve(__dirname, '../eval/clip-comparison.json'), `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), perCatalog, results }, null, 2)}\n`);
  console.log('\nsaved backend/eval/clip-comparison.json');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); process.exit(); });
