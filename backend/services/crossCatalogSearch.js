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
import { facetAlignmentScore, hybridSearchScore, similarityFloor, precomputeFacetData } from './searchQueryIntel.js';

// Query-independent facet data per cached product (the cached candidate objects keep their identity between queries).
const FACET_MEMO = new WeakMap();
const facetDataOf = (d) => {
  let fx = FACET_MEMO.get(d);
  if (!fx) FACET_MEMO.set(d, (fx = precomputeFacetData(d)));
  return fx;
};
import { parseGenderFilter, attachGenderFilter } from '../utils/catalogQuery.js';
import { escapeRegex } from '../utils/regexEscape.js';

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
      return kept.map((d) => ({ d, catalog: key })); // references only: copying 3,000+ product objects per query was a top CPU cost
    })
  );

  const products = perCatalogResults.flat();
  if (products.length === 0) return { results: [], relaxedFloor: false, totalCandidates: 0 };

  const qlen = signals.raw.length;
  const hints = signals.catalogHints || [];
  const scoredAll = products.map(({ d, catalog: cat }) => {
    const cos = cosineSimilarity(queryEmbedding, d.embedding);
    const facet = facetAlignmentScore(signals, d, facetDataOf(d));
    // A query that names a product type ("choker", "heels", "watch") should rank that catalog first.
    const catalogAdj = hints.length ? (hints.includes(cat) ? CATALOG_HINT_BOOST : -CATALOG_HINT_BOOST) : 0;
    const hybrid = hybridSearchScore(cos, facet, qlen, signals.hasStrongConstraints) + catalogAdj;
    return { d, styleGroup: d.styleGroup, _catalog: cat, _cosine: cos, _facet: facet, _score: hybrid };
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
  const results = scored.map(({ d, _cosine, _facet, _score, _catalog, _variants }) => {
    const { embedding, ...p } = d;
    return {
    ...p,
    ...(_variants ? { variantCount: _variants } : {}),
    catalog: _catalog,
    relevanceScore: parseFloat(_score.toFixed(4)),
    semanticCosine: parseFloat(_cosine.toFixed(4)),
    facetScore: parseFloat(_facet.toFixed(4))
    };
  });

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

  // User text goes into $regex: ALWAYS escape it (an unescaped "(a+)+$" is a slow-regex / injection risk).
  const colorList = (Array.isArray(color) ? color : [color]).filter(Boolean).map(escapeRegex);
  const terms = keywords.filter(Boolean).slice(0, 6);
  const termRx = terms.map(escapeRegex);
  if (!colorList.length && !termRx.length) return { results: [], relaxedFloor: false, totalCandidates: 0 };

  const colorClause = colorList.length
    ? { $or: colorList.flatMap((c) => [
        { primaryColor: { $regex: c, $options: 'i' } },
        { primaryExactColor: { $regex: c, $options: 'i' } },
        { exactColors: { $elemMatch: { $regex: c, $options: 'i' } } },
        { colors: { $elemMatch: { $regex: c, $options: 'i' } } },
      ]) }
    : null;
  const termClause = (kw) => ({ $or: [
    { name: { $regex: kw, $options: 'i' } },
    { tags: { $elemMatch: { $regex: kw, $options: 'i' } } },
    { description: { $regex: kw, $options: 'i' } },
  ] });

  // Two tiers. Tier 1 is SPECIFIC: every term (and the colour) must match, so "white kurta" finds white kurtas even in
  // a catalog with thousands of kurtas. Tier 2 widens to ANY term, only if tier 1 came up short. Within each tier
  // results are ranked by keywordScore. (A single wide $or with a fixed pool could miss the best match entirely.)
  const base = () => { const q = { inStock: { $ne: false } }; attachGenderFilter(q, gender); return q; };
  const specific = { ...base(), $and: [...termRx.map(termClause), ...(colorClause ? [colorClause] : [])] };
  const wide = { ...base(), $or: [...(colorClause ? colorClause.$or : []), ...termRx.flatMap((kw) => termClause(kw).$or)] };
  const pool = Math.min(Math.max(limit * 6, 60), 200);
  const fetch = async (query) => (await Promise.all(
    wantCatalogs.map(async ({ key, Model }) => (await Model.find(query, { embedding: 0 }).limit(pool).lean()).map((d) => ({ ...d, catalog: key }))),
  )).flat();
  const rank = (docs) => docs
    .map((d) => ({ d, s: keywordScore(d, terms, colorList) }))
    .sort((a, b) => b.s - a.s || (b.d.metadataScore ?? 0) - (a.d.metadataScore ?? 0))
    .map((x) => x.d);

  const first = termRx.length ? rank(await fetch(specific)) : [];
  let results = first.slice(0, limit);
  if (results.length < limit) {
    const seen = new Set(results.map((d) => String(d._id)));
    const more = rank(await fetch(wide)).filter((d) => !seen.has(String(d._id)));
    results = [...results, ...more].slice(0, limit);
  }
  return { results, relaxedFloor: false, totalCandidates: results.length };
}

/**
 * Words worth searching for in a free-text request: lower-case, no stop words, no amounts or currency
 * ("under 8000 PKR" must not become the search terms "under", "8000", "pkr").
 */
export function keywordTerms(text) {
  const STOP = new Set(['a', 'an', 'the', 'for', 'and', 'with', 'under', 'below', 'over', 'above', 'budget', 'total', 'each', 'piece', 'pieces', 'pkr', 'rs', 'rupees', 'my', 'me', 'to', 'of', 'in', 'on', 'some', 'something', 'want', 'need', 'looking', 'show', 'find', 'give', 'please', 'any', 'good', 'nice', 'best', 'look', 'outfit', 'wear']);
  return [...new Set(
    String(text || '').toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+k?$/.test(w)),
  )];
}

/** How well one product matches the search terms: name 3, tags 2, description 1, colour 2. Pure; used to rank the keyword fallback. */
export function keywordScore(doc, terms, colors = []) {
  const name = String(doc.name || '').toLowerCase();
  const tags = (doc.tags || []).join(' ').toLowerCase();
  const desc = String(doc.description || '').toLowerCase();
  const colorBlob = [doc.primaryColor, doc.primaryExactColor, ...(doc.colors || []), ...(doc.exactColors || [])].join(' ').toLowerCase();
  let s = 0;
  for (const t of terms) {
    const lt = String(t).toLowerCase();
    if (name.includes(lt)) s += 3;
    else if (tags.includes(lt)) s += 2;
    else if (desc.includes(lt)) s += 1;
  }
  for (const c of colors) if (colorBlob.includes(String(c).toLowerCase())) s += 2;
  return s;
}
