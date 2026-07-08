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
import { getTextEmbedding } from './huggingface.js';
import { facetAlignmentScore, hybridSearchScore, similarityFloor } from './searchQueryIntel.js';
import { attachGenderFilter } from '../utils/catalogQuery.js';

export const CATALOGS = [
  {
    key: 'clothing',
    Model: ClothingProduct,
    fields: 'embedding name brand category subCategory dressStyle description tags colors price gender images primaryColor occasion style productUrl'
  },
  {
    key: 'shoes',
    Model: ShoeProduct,
    fields: 'embedding name brand category subCategory shoeType description tags colors price gender images primaryColor occasion style productUrl'
  },
  {
    key: 'jewelry',
    Model: JewelryProduct,
    fields: 'embedding name brand category jewelryType jewelryCategory description tags colors price gender images primaryColor occasion style productUrl'
  },
  {
    key: 'watches',
    Model: WatchProduct,
    fields: 'embedding name brand category watchType description tags colors price gender images primaryColor occasion style productUrl'
  }
];

export async function getEmbedding(text) {
  const token = process.env.HUGGING_FACE_API_KEY;
  if (!token) return null;
  const embedding = await getTextEmbedding(text);
  if (!embedding) throw new Error('HuggingFace SDK failed to return embedding');
  return Array.isArray(embedding[0]) ? embedding[0] : embedding;
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
      const matchQuery = { embedding: { $exists: true, $ne: [] } };
      if (category && key === 'clothing') matchQuery.category = category;
      attachGenderFilter(matchQuery, gender ?? signals.genderHint);
      const selectObj = fields.split(' ').reduce((o, f) => ({ ...o, [f]: 1 }), {});
      const docs = await Model.find(matchQuery, selectObj).limit(400).lean();
      return docs.map((d) => ({ ...d, _catalog: key }));
    })
  );

  const products = perCatalogResults.flat();
  if (products.length === 0) return { results: [], relaxedFloor: false, totalCandidates: 0 };

  const qlen = signals.raw.length;
  const scoredAll = products.map((p) => {
    const cos = cosineSimilarity(queryEmbedding, p.embedding);
    const facet = facetAlignmentScore(signals, p);
    const hybrid = hybridSearchScore(cos, facet, qlen, signals.hasStrongConstraints);
    return { ...p, _cosine: cos, _facet: facet, _score: hybrid };
  });

  const floor = similarityFloor(signals);
  let ranked = scoredAll.filter((p) => p._score >= floor).sort((a, b) => b._score - a._score);
  let relaxed = false;
  if (ranked.length === 0 && scoredAll.length) {
    relaxed = true;
    ranked = [...scoredAll].sort((a, b) => b._score - a._score).slice(0, Math.max(limit, 10));
  }

  const scored = ranked.slice(0, limit);
  const results = scored.map(({ embedding, _cosine, _facet, _score, _catalog, ...p }) => ({
    ...p,
    catalog: _catalog,
    relevanceScore: parseFloat(_score.toFixed(4)),
    semanticCosine: parseFloat(_cosine.toFixed(4)),
    facetScore: parseFloat(_facet.toFixed(4))
  }));

  return { results, relaxedFloor: relaxed, totalCandidates: products.length };
}

/**
 * Regex-based cross-catalog fallback for when HUGGING_FACE_API_KEY isn't set —
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

  const query = { $or: orClauses };
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
