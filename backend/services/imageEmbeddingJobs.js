/**
 * imageEmbeddingJobs.js — compute CLIP vectors for product photos.
 *
 * Resumable and idempotent: a product is picked up when it has no image vector, the vector is from
 * another model, or its image URL changed since the vector was made. Downloads go through the SSRF
 * guard with bounded concurrency; the model itself is single-threaded (see imageEmbeddings.js). A
 * product whose image cannot be fetched/decoded is skipped and counted, never fatal.
 */
import { safeGetBuffer } from '../utils/safeFetch.js';
import { embedImage, IMAGE_EMBEDDING_MODEL_ID } from './imageEmbeddings.js';
import { CATALOGS } from './crossCatalogSearch.js';

const imageUrlOf = (p) => p.imageUrl || p.images?.[0] || '';

/** Mongo filter: in-stock products that need a (new) image vector. */
export function needsImageEmbeddingFilter(modelId = IMAGE_EMBEDDING_MODEL_ID) {
  return {
    inStock: { $ne: false },
    $or: [
      { imageEmbedding: { $exists: false } },
      { imageEmbedding: { $size: 0 } },
      { imageEmbeddingModel: { $ne: modelId } },
      // the vector was made from a different picture than the one the product shows now
      { $expr: { $ne: [{ $ifNull: ['$imageEmbeddingUrl', ''] }, { $ifNull: ['$imageUrl', ''] }] } },
    ],
  };
}

/** True when the stored vector no longer matches the product's current image. */
export function isImageVectorStale(p, modelId = IMAGE_EMBEDDING_MODEL_ID) {
  if (!p.imageEmbedding?.length || p.imageEmbeddingModel !== modelId) return true;
  return Boolean(imageUrlOf(p)) && p.imageEmbeddingUrl !== imageUrlOf(p);
}

/**
 * @param {import('mongoose').Model} Model
 * @param {{ limit?: number, concurrency?: number, fetchImage?: Function, embed?: Function, log?: Function, force?: boolean }} [opts]
 * @returns {Promise<{ scanned: number, embedded: number, skipped: number, failures: string[] }>}
 */
export async function embedPendingImages(Model, { limit = Infinity, concurrency = 6, fetchImage = (u) => safeGetBuffer(u, { timeout: 20000 }).then((r) => r.data), embed = embedImage, log = () => {}, force = false } = {}) {
  const docs = await Model.find(force ? { inStock: { $ne: false } } : needsImageEmbeddingFilter(), 'imageUrl images imageEmbedding imageEmbeddingModel imageEmbeddingUrl name').lean();
  const todo = docs.filter((d) => imageUrlOf(d) && (force || isImageVectorStale(d))).slice(0, limit);
  const result = { scanned: todo.length, embedded: 0, skipped: 0, failures: [] };

  // Sliding window: up to `concurrency` downloads are in flight ahead of the (serial) model, so the CPU
  // never waits for the network but memory stays bounded.
  const inflight = new Map();
  let started = 0;
  const startDownloads = (upTo) => {
    while (started < todo.length && started < upTo) {
      const i = started++;
      inflight.set(i, fetchImage(imageUrlOf(todo[i])).then((buffer) => ({ buffer }), (error) => ({ error })));
    }
  };

  const ops = [];
  const flush = async () => {
    if (!ops.length) return;
    await Model.bulkWrite(ops.splice(0, ops.length), { ordered: false });
  };
  const fail = (doc, what, e) => {
    result.skipped++;
    if (result.failures.length < 10) result.failures.push(`${doc.name}: ${what}${e.message}`.slice(0, 120));
  };

  for (let i = 0; i < todo.length; i++) {
    startDownloads(i + concurrency);
    const { buffer, error } = await inflight.get(i);
    inflight.delete(i);
    const doc = todo[i];
    if (error) { fail(doc, '', error); continue; }
    try {
      const vec = await embed(buffer);
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { imageEmbedding: vec, imageEmbeddingModel: IMAGE_EMBEDDING_MODEL_ID, imageEmbeddingUrl: imageUrlOf(doc) } } } });
      result.embedded++;
    } catch (e) {
      fail(doc, 'decode/embed failed: ', e);
    }
    if (ops.length >= 50) await flush();
    if ((i + 1) % 100 === 0) log(`  ${i + 1}/${todo.length} processed`);
  }
  await flush();
  return result;
}

export async function embedAllImages(opts = {}) {
  const summary = {};
  for (const { key, Model } of CATALOGS) summary[key] = await embedPendingImages(Model, opts);
  return summary;
}
