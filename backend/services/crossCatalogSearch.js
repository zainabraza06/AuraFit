/**
 * Shared cross-catalog (clothing + shoes + jewelry + watches) semantic search —
 * used by both the text search endpoint and visual (image) search, so a query
 * built from a typed sentence or from Gemini's photo analysis gets identical,
 * correctly-ranked treatment across every catalog.
 */
import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import WatchProduct from '../models/WatchProduct.js';
import { embedQuery, isEmbeddingConfigured, EMBEDDING_MODEL_ID, EMBEDDING_DIM, searchDims, truncateAndNormalize } from './embeddings.js';
import { loadCandidates } from './vectorCache.js';
import { facetAlignmentScore, hybridSearchScore, similarityFloor } from './searchQueryIntel.js';
import { parseGenderFilter } from '../utils/catalogQuery.js';

/** Score adjustment for products in (+) / outside (-) the catalog a query names. */
export const CATALOG_HINT_BOOST = Number(process.env.CATALOG_HINT_BOOST || 0.08);

export const CATALOGS = [
  {
    key: 'clothing',
    Model: ClothingProduct,
    fields: 'embedding name brand category subCategory dressStyle description tags colors price gender images primaryColor occasion style productUrl inStock styleCode styleGroup'
  },
  {
    key: 'shoes',
    Model: ShoeProduct,
    fields: 'embedding name brand category subCategory shoeType description tags colors price gender images primaryColor occasion style productUrl inStock'
  },
  {
    key: 'jewelry',
    Model: JewelryProduct,
    fields: 'embedding name brand category jewelryType jewelryCategory description tags colors price gender images primaryColor occasion style productUrl inStock'
  },
  {
    key: 'watches',
    Model: WatchProduct,
    fields: 'embedding name brand category watchType description tags colors price gender images primaryColor occasion style productUrl inStock'
  }
];

/**
 * Keeps the best-scoring product of each styleGroup (input must already be sorted best-first) and records
 * how many colourways were folded into it. Products without a styleGroup are never merged.
 */
export function collapseByStyleGroup(ranked) {
  const seen = new Map();
  const out = [];
  for (const p of ranked) {
    if (!p.styleGroup) { out.push(p); continue; }
    const first = seen.get(p.styleGroup);
    if (first) { first._variants = (first._variants || 1) + 1; continue; }
    seen.set(p.styleGroup, p);
    out.push(p);
  }
  return out;
}

/** Query -> vector with the current model, or null when embeddings are unavailable. */
export async function getEmbedding(text) {
  if (!isEmbeddingConfigured()) return null;
  const v = await embedQuery(text);
  const dims = searchDims();
  return dims < EMBEDDING_DIM && v.length > dims ? truncateAndNormalize(v, dims) : v;
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

/**
 * Runs a hybrid cosine + facet search across the requested catalogs and returns
 * a merged, ranked, honestly-scored result list.
 * @param {ReturnType<typeof import('./searchQueryIntel.js').analyzeSearchQuery>} signals
 * @param {number[]} queryEmbedding
 * @param {{ limit?: number, gender?: string, catalog?: string, category?: string }} [opts]
 */
export async function searchAcrossCatalogs(signals, queryEmbedding, opts = {}) {
  const { limit = 20, gender, catalog, category } = opts;

  const wantCatalogs = catalog
    ? CATALOGS.filter((c) => c.key === String(catalog).toLowerCase())
    : CATALOGS;

  const perCatalogResults = await Promise.all(
    wantCatalogs.map(async ({ key, Model, fields }) => {
      // Only vectors from the CURRENT model are comparable with the query vector
      // The cache key is the catalog only: gender/category are applied in memory below, so one warm cache
      // serves every filter combination (it used to be one ~30 MB database fetch per distinct filter).
      const matchQuery = { embedding: { $exists: true, $ne: [] }, embeddingModel: EMBEDDING_MODEL_ID, inStock: { $ne: false } };
      const dims = searchDims();
      const selectObj = fields.split(' ').reduce((o, f) => ({ ...o, [f]: 1 }), {});
      // $slice makes MongoDB send only the first `dims` numbers of each vector (4x less data at 256 dims)
      if (dims < EMBEDDING_DIM) selectObj.embedding = { $slice: dims };
      // Whole candidate set (cached, Float32 vectors) - this used to be .limit(400), i.e. most of the catalog was never searched
      const docs = await loadCandidates(Model, key, matchQuery, selectObj, { truncate: dims < EMBEDDING_DIM ? dims : 0 });
      const genders = parseGenderFilter(gender ?? signals.genderHint);
      const wantCategory = category && key === 'clothing' ? category : null;
      const kept = (genders || wantCategory) ? docs.filter((d) => (!genders || genders.includes(d.gender)) && (!wantCategory || d.category === wantCategory)) : docs;
      return kept.map((d) => ({ ...d, _catalog: key }));
    })
  );

  const products = perCatalogResults.flat();
  if (products.length === 0) return { results: [], relaxedFloor: false, totalCandidates: 0 };

  const qlen = signals.raw.length;
  const scoredAll = products.map((p) => {
    const cos = cosineSimilarity(queryEmbedding, p.embedding);
    const facet = facetAlignmentScore(signals, p);
    // A query that names a product type ("choker", "heels", "watch") should rank that catalog first.
    const hints = signals.catalogHints || [];
    const catalogAdj = hints.length ? (hints.includes(p._catalog) ? CATALOG_HINT_BOOST : -CATALOG_HINT_BOOST) : 0;
    const hybrid = hybridSearchScore(cos, facet, qlen, signals.hasStrongConstraints) + catalogAdj;
    return { ...p, _cosine: cos, _facet: facet, _score: hybrid };
  });

  const floor = similarityFloor(signals);
  let ranked = scoredAll.filter((p) => p._score >= floor).sort((a, b) => b._score - a._score);
  let relaxed = false;
  if (ranked.length === 0 && scoredAll.length) {
    relaxed = true;
    ranked = [...scoredAll].sort((a, b) => b._score - a._score).slice(0, Math.max(limit, 10));
  }

  // One card per design: the same style in other colours is folded into its best-scoring colourway.
  if (opts.collapseColorways !== false) ranked = collapseByStyleGroup(ranked);

  const scored = ranked.slice(0, limit);
  const results = scored.map(({ embedding, _cosine, _facet, _score, _catalog, _variants, ...p }) => ({
    ...p,
    ...(_variants ? { variantCount: _variants } : {}),
    catalog: _catalog,
    relevanceScore: parseFloat(_score.toFixed(4)),
    semanticCosine: parseFloat(_cosine.toFixed(4)),
    facetScore: parseFloat(_facet.toFixed(4))
  }));

  return { results, relaxedFloor: relaxed, totalCandidates: products.length };
}

/**
 * Regex-based cross-catalog fallback for when embeddings aren't available —
 * checks BOTH the canonical color family AND the exact scraped shade (a photo
 * analysis often returns a specific shade like "maroon", which only lives in
 * primaryExactColor/exactColors, never in the canonical primaryColor field).
 */
export async function regexSearchAcrossCatalogs({ color, keywords = [], gender }, opts = {}) {
  const { limit = 20, catalog } = opts;
  const wantCatalogs = catalog
    ? CATALOGS.filter((c) => c.key === String(catalog).toLowerCase())
    : CATALOGS;

  const orClauses = [];
  const colorList = (Array.isArray(color) ? color : [color]).filter(Boolean);
  for (const c of colorList) {
    orClauses.push(
      { primaryColor: { $regex: c, $options: 'i' } },
      { primaryExactColor: { $regex: c, $options: 'i' } },
      { exactColors: { $elemMatch: { $regex: c, $options: 'i' } } },
      { colors: { $elemMatch: { $regex: c, $options: 'i' } } }
    );
  }
  for (const kw of keywords.slice(0, 5)) {
    if (!kw) continue;
    orClauses.push(
      { name: { $regex: kw, $options: 'i' } },
      { tags: { $elemMatch: { $regex: kw, $options: 'i' } } },
      { description: { $regex: kw, $options: 'i' } }
    );
  }
  if (!orClauses.length) return { results: [], relaxedFloor: false, totalCandidates: 0 };

  const query = { $or: orClauses, inStock: { $ne: false } };
  attachGenderFilter(query, gender);

  const perCatalog = await Promise.all(
    wantCatalogs.map(async ({ key, Model }) => {
      const docs = await Model.find(query, { embedding: 0 }).limit(limit).lean();
      return docs.map((d) => ({ ...d, catalog: key }));
    })
  );
  const results = perCatalog.flat().slice(0, limit);
  return { results, relaxedFloor: false, totalCandidates: results.length };
}
