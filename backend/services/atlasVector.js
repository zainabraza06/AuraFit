/**
 * atlasVector.js — MongoDB Atlas Vector Search ($vectorSearch) for the four catalogs.
 *
 * One vector index per catalog collection, holding BOTH vector fields:
 *   embedding       1024 dims  text (Qwen3-Embedding)   cosine
 *   imageEmbedding   512 dims  photo (FashionCLIP)      cosine
 * plus the filter fields the searches pre-filter on (stock, model, gender, category).
 * Pre-filtering inside the index means the database returns the nearest IN-STOCK vectors of the CURRENT
 * model, instead of Node pulling every vector into memory and ranking them itself.
 *
 * Backend choice (VECTOR_BACKEND): 'auto' (default) uses Atlas for every catalog whose index is queryable and
 * the in-process search (vectorCache.js) for the rest; 'memory' forces the in-process path (used as the eval baseline).
 * Never "force Atlas": $vectorSearch on a collection without an index returns nothing rather than an error.
 * Any $vectorSearch error also falls back to memory, so search never goes down because an index is missing
 * (a free Atlas cluster allows only 3 search indexes, so a 4-catalog deployment can be partially indexed).
 */
import mongoose from 'mongoose';

export const VECTOR_INDEX_NAME = process.env.VECTOR_INDEX_NAME || 'vector_index';
const STATUS_TTL_MS = 60_000;

export const VECTOR_FIELDS = [
  { path: 'embedding', numDimensions: 1024 },
  { path: 'imageEmbedding', numDimensions: 512 },
];
export const FILTER_FIELDS = ['inStock', 'embeddingModel', 'imageEmbeddingModel', 'gender', 'category'];

export function vectorBackendMode() {
  const m = String(process.env.VECTOR_BACKEND || 'auto').toLowerCase();
  return m === 'memory' ? 'memory' : 'auto';
}

/** The index definition (pure: unit-tested). */
export function indexDefinition() {
  return {
    fields: [
      ...VECTOR_FIELDS.map((f) => ({ type: 'vector', path: f.path, numDimensions: f.numDimensions, similarity: 'cosine' })),
      ...FILTER_FIELDS.map((path) => ({ type: 'filter', path })),
    ],
  };
}

/** Atlas reports cosine as (1 + cos) / 2; undo that so scores stay comparable with the in-process search. */
export const scoreToCosine = (atlasScore) => 2 * atlasScore - 1;

/**
 * Pre-filter for $vectorSearch. Only fields declared as `filter` in the index may appear here.
 * @param {{ modelField: 'embeddingModel'|'imageEmbeddingModel', modelId: string, genders?: string[]|null, category?: string|null }} p
 */
export function buildFilter({ modelField, modelId, genders, category }) {
  const clauses = [{ inStock: { $ne: false } }, { [modelField]: { $eq: modelId } }];
  if (genders?.length) clauses.push({ gender: { $in: genders } });
  if (category) clauses.push({ category: { $eq: category } });
  return { $and: clauses };
}

/** The aggregation pipeline for one catalog (pure: unit-tested). */
export function buildPipeline({ path, vector, filter, limit, numCandidates, exact = false, projection = {} }) {
  const stage = { index: VECTOR_INDEX_NAME, path, queryVector: Array.from(vector), limit, filter };
  if (exact) stage.exact = true;
  else stage.numCandidates = Math.min(10_000, Math.max(numCandidates ?? limit * 10, limit));
  return [{ $vectorSearch: stage }, { $project: { ...projection, _vsScore: { $meta: 'vectorSearchScore' } } }];
}

// ---- index status (cached) --------------------------------------------------------------------------------------
const status = new Map(); // collection name -> { at, ready, state }

export async function indexState(Model) {
  const name = Model.collection.collectionName;
  const hit = status.get(name);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit;
  let state = { at: Date.now(), ready: false, state: 'missing' };
  try {
    const found = await Model.collection.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
    const ix = found.find((i) => i.name === VECTOR_INDEX_NAME);
    if (ix) state = { at: Date.now(), ready: !!ix.queryable, state: ix.status || (ix.queryable ? 'READY' : 'BUILDING') };
  } catch (e) {
    state = { at: Date.now(), ready: false, state: `unsupported: ${String(e.message).slice(0, 80)}` };
  }
  status.set(name, state);
  return state;
}

export function resetIndexStatus() {
  status.clear();
}

/** Should this catalog be searched through Atlas right now? */
export async function useAtlas(Model) {
  const mode = vectorBackendMode();
  if (mode === 'memory' || mongoose.connection.readyState !== 1) return false;
  return (await indexState(Model)).ready;
}

/**
 * Nearest vectors for one catalog. Returns docs with `cosine` set; callers re-rank with their own signals.
 * Throws on a database error: callers fall back to the in-process path.
 */
export async function vectorSearch(Model, { path, vector, filter, limit, numCandidates, projection }) {
  const exact = String(process.env.VECTOR_EXACT || '') === '1';
  const pipeline = buildPipeline({ path, vector, filter, limit, numCandidates, exact, projection });
  const docs = await Model.aggregate(pipeline).option({ maxTimeMS: 8000 });
  return docs.map((d) => {
    const { _vsScore, ...rest } = d;
    return { ...rest, cosine: scoreToCosine(_vsScore) };
  });
}

/** Create (or report) the vector index on one collection. Returns 'created' | 'exists'. */
export async function ensureVectorIndex(Model) {
  const existing = await Model.collection.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
  if (existing.some((i) => i.name === VECTOR_INDEX_NAME)) return 'exists';
  await Model.collection.createSearchIndex({ name: VECTOR_INDEX_NAME, type: 'vectorSearch', definition: indexDefinition() });
  resetIndexStatus();
  return 'created';
}

/** For /api/health: which catalogs are served by Atlas Vector Search right now (index states are cached for 60 s). */
export async function vectorSummary(catalogs) {
  if (vectorBackendMode() === 'memory') return { backend: 'memory', indexed: [] };
  const states = await Promise.all(catalogs.map(async ({ key, Model }) => [key, (await indexState(Model)).ready]));
  const indexed = states.filter(([, ok]) => ok).map(([k]) => k);
  return { backend: indexed.length ? 'atlas' : 'memory', indexed };
}
