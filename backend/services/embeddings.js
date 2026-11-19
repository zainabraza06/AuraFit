/**
 * embeddings.js — the single place the app turns text into vectors.
 *
 * Default backend: Qwen3-Embedding-0.6B (q8 ONNX) running IN-PROCESS via transformers.js.
 *  - no API key, no per-call cost, no separate server (works on a laptop and on a CI runner)
 *  - multilingual (Urdu / Roman Urdu / English), 1024 dimensions
 *  - instruction-aware: QUERIES carry a task instruction, DOCUMENTS are embedded as plain text
 *
 * Every stored vector is tagged with EMBEDDING_MODEL_ID. Vectors from different models
 * (or different dimensions) are not comparable, so search must only use rows whose
 * `embeddingModel` equals the current id.
 *
 * Tests (and any alternative provider) can swap the backend with setEmbeddingBackend().
 */
import path from 'path';
import { currentPolicy } from './memoryProfile.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EMBEDDING_MODEL_ID = process.env.EMBEDDING_MODEL_ID || 'Qwen/Qwen3-Embedding-0.6B:q8';
export const EMBEDDING_DIM = 1024;

const MODEL_REPO = process.env.EMBEDDING_MODEL_REPO || 'onnx-community/Qwen3-Embedding-0.6B-ONNX';
const MODEL_DTYPE = process.env.EMBEDDING_MODEL_DTYPE || 'q8';
const QUERY_TASK = 'Given a fashion shopping query, retrieve the clothing, shoe or jewelry products that match it';
const MAX_CHARS = 2000; // keeps CPU time bounded; product text is far shorter than the model's context

/** Qwen3-Embedding expects queries as "Instruct: <task>\nQuery: <text>". Documents are passed unchanged. */
export function formatQuery(text, task = QUERY_TASK) {
  return `Instruct: ${task}\nQuery: ${String(text).slice(0, MAX_CHARS)}`;
}

// ─── Default backend: transformers.js ────────────────────────────────────────
let extractorPromise = null;

async function loadExtractor() {
  const { pipeline, env } = await import('@huggingface/transformers');
  // Cache on the project drive (defaults to backend/.model-cache, gitignored). CI restores it between runs.
  env.cacheDir = process.env.EMBEDDING_CACHE_DIR || path.resolve(__dirname, '../.model-cache');
  return pipeline('feature-extraction', MODEL_REPO, { dtype: MODEL_DTYPE });
}

const localBackend = {
  async embed(texts) {
    extractorPromise ||= loadExtractor();
    const extractor = await extractorPromise;
    const out = await extractor(texts, { pooling: 'last_token', normalize: true });
    return out.tolist();
  },
};

let backend = localBackend;

/** @param {{ embed(texts: string[]): Promise<number[][]> } | null} replacement  null restores the default. */
export function setEmbeddingBackend(replacement) {
  backend = replacement || localBackend;
  clearQueryCache(); // vectors from another backend are not comparable
}

// ONNX sessions are not safe to run concurrently; serialise calls through one queue.
let chain = Promise.resolve();
function serialised(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function embedMany(texts) {
  if (!texts.length) return [];
  const vectors = await serialised(() => backend.embed(texts));
  if (vectors.length !== texts.length) throw new Error(`embedding backend returned ${vectors.length} vectors for ${texts.length} texts`);
  return vectors;
}

// Query-embedding cache: people repeat searches (and the same text is embedded for paging, refinements,
// and the weekly eval). An embedding costs ~100-300 ms of CPU on the single ONNX queue; a hit costs ~0.
const QUERY_CACHE_MAX = Number(process.env.EMBEDDING_QUERY_CACHE_MAX || 1000);
const queryCache = new Map(); // text -> vector (Map keeps insertion order => cheap LRU)
const queryCacheStats = { hits: 0, misses: 0 };

export function queryCacheInfo() {
  return { size: queryCache.size, ...queryCacheStats };
}

export function clearQueryCache() {
  queryCache.clear();
  queryCacheStats.hits = 0;
  queryCacheStats.misses = 0;
}

/** One search query -> vector (with the task instruction). Cached per exact normalised text. */
export async function embedQuery(text) {
  const clean = String(text ?? '').trim();
  if (!clean) throw new Error('embedQuery: empty text');
  const key = clean.toLowerCase().replace(/\s+/g, ' ');
  const hit = queryCache.get(key);
  if (hit) {
    queryCacheStats.hits++;
    queryCache.delete(key); // refresh recency
    queryCache.set(key, hit);
    return hit;
  }
  queryCacheStats.misses++;
  const vector = (await embedMany([formatQuery(clean)]))[0];
  queryCache.set(key, vector);
  if (queryCache.size > QUERY_CACHE_MAX) queryCache.delete(queryCache.keys().next().value);
  return vector;
}

/** Product / document texts -> vectors, in order. Processes in small batches to bound memory. */
export async function embedDocuments(texts, { batchSize = 8 } = {}) {
  const prepared = texts.map((t) => String(t ?? '').trim().slice(0, MAX_CHARS) || ' ');
  const out = [];
  for (let i = 0; i < prepared.length; i += batchSize) out.push(...(await embedMany(prepared.slice(i, i + batchSize))));
  return out;
}

/**
 * Dimensions used for SEARCH. Qwen3-Embedding is trained with Matryoshka representation learning, so the
 * first N dims of a vector are themselves a usable embedding. Fewer dims = smaller database payload,
 * less memory and faster cosine. Measured on the golden set (eval:search, 34 answerable queries):
 *   1024: P@10 0.809 R 0.842 MRR 0.946 nDCG 0.892   (baseline)
 *    512: 0.794 / 0.827 / 0.945 / 0.881
 *    256: 0.806 / 0.838 / 0.948 / 0.885   <- default: within noise of full size, 4x smaller
 *    128: 0.768 / 0.799 / 0.945 / 0.862   (visibly worse)
 * Stored vectors are never changed; truncation happens when candidates are loaded. Set
 * EMBEDDING_SEARCH_DIMS=1024 to search with the full vectors.
 */
const DEFAULT_SEARCH_DIMS = 256;
export function searchDims() {
  const n = Number(process.env.EMBEDDING_SEARCH_DIMS || DEFAULT_SEARCH_DIMS);
  return Number.isInteger(n) && n >= 32 && n <= EMBEDDING_DIM ? n : DEFAULT_SEARCH_DIMS;
}

/** First `dims` components, re-normalised to unit length (so dot product = cosine). Returns a Float32Array. */
export function truncateAndNormalize(vec, dims) {
  const n = Math.min(dims, vec.length);
  const out = new Float32Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) { out[i] = vec[i]; norm += vec[i] * vec[i]; }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < n; i++) out[i] /= norm;
  return out;
}

/** Cosine similarity for already-normalised vectors is just the dot product; this also works for unnormalised ones. */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * True when search can embed queries. The local model needs no credentials, but tests must never
 * load a 600 MB model by accident, so under NODE_ENV=test it is only "configured" once a fake
 * backend has been injected with setEmbeddingBackend().
 */
export function isEmbeddingConfigured() {
  if (backend !== localBackend) return true; // an injected backend (tests, a remote provider) needs no local RAM
  return process.env.NODE_ENV !== 'test' && currentPolicy().text; // ...but the local model must fit in memory
}
