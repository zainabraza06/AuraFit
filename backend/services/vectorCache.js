/**
 * vectorCache.js — short-lived in-memory cache of a catalog's candidate rows + vectors.
 *
 * Why: semantic search ranks by cosine similarity in Node. It used to read only the first 400
 * rows per catalog from Mongo on EVERY query, which (a) silently ignored most of the catalog
 * and (b) with 1024-dim vectors would mean pulling tens of MB per request if the cap were lifted.
 * Here the full candidate set for a given filter is fetched once, stored as Float32Array
 * (half the memory of JS numbers) and reused until it expires.
 *
 * Freshness: entries live VECTOR_CACHE_TTL_MS (default 5 min). A weekly refresh therefore shows up
 * in search within minutes. clearVectorCache() forces it (used after embedding jobs and in tests).
 */
import { truncateAndNormalize } from './embeddings.js';

const TTL_MS = Number(process.env.VECTOR_CACHE_TTL_MS || 5 * 60 * 1000);
const MAX_ENTRIES = Number(process.env.VECTOR_CACHE_MAX_ENTRIES || 24);

/** @type {Map<string, { at: number, promise: Promise<object[]> }>} */
const cache = new Map();

export function clearVectorCache() {
  cache.clear();
}

export function vectorCacheSize() {
  return cache.size;
}

/**
 * @param {import('mongoose').Model} Model
 * @param {string} catalogKey
 * @param {object} matchQuery  Mongo filter (already includes stock + current-model constraints)
 * @param {object} projection  fields to select (must include `embedding`)
 * @returns {Promise<object[]>} rows whose `embedding` is a Float32Array
 */
export async function loadCandidates(Model, catalogKey, matchQuery, projection, { truncate = 0, field = 'embedding' } = {}) {
  const key = `${catalogKey}:${field}:${JSON.stringify(matchQuery)}:${truncate || 'full'}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.promise;

  // Store the promise itself so concurrent first requests share one database read
  const promise = Model.find(matchQuery, projection)
    .lean()
    .then((docs) => {
      // Vectors may already be truncated by the projection ($slice); re-normalise so cosine stays correct.
      for (const d of docs) d[field] = truncate ? truncateAndNormalize(d[field], truncate) : Float32Array.from(d[field]);
      return docs;
    });
  cache.set(key, { at: now, promise });
  promise.catch(() => cache.delete(key)); // never cache a failure

  // Bound memory: drop the oldest entry when over the limit
  if (cache.size > MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    cache.delete(oldest[0]);
  }
  return promise;
}
