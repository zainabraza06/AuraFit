/**
 * embeddingJobs.js — keep every catalog's vectors in sync with the current embedding model AND text.
 *
 * A row needs (re-)embedding when:
 *   - it has no vector, or an empty one;
 *   - its vector came from a different model (e.g. the old 384-dim MiniLM vectors);
 *   - the text it would be embedded from has changed since (a scrape updated the description,
 *     name, colour...). Each vector stores a hash of its source text, so a vector can never
 *     silently describe a product as it used to be.
 *
 * Re-running is always safe: rows that are current are skipped.
 */
import { createHash } from 'node:crypto';
import { embedDocuments, EMBEDDING_MODEL_ID } from './embeddings.js';

/** Short stable fingerprint of the text a vector was computed from. */
export function textHash(text) {
  return createHash('sha1').update(String(text ?? '')).digest('hex').slice(0, 16);
}

/** Mongo filter for the cheap cases: no vector, empty vector, or a vector from another model. */
export function needsEmbeddingFilter(modelId = EMBEDDING_MODEL_ID) {
  return {
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
      { embeddingModel: { $ne: modelId } },
    ],
  };
}

/** Ids of every row that needs embedding: the cheap cases plus rows whose source text changed. */
async function findPendingIds(Model, buildText, modelId) {
  const ids = new Set((await Model.find(needsEmbeddingFilter(modelId)).select('_id').lean()).map((d) => String(d._id)));

  // Current-model rows: stale only if the text changed. Vectors are excluded from the read (they are big).
  const current = Model.find({ embeddingModel: modelId, embedding: { $exists: true, $not: { $size: 0 } } })
    .select('-embedding')
    .lean()
    .cursor();
  for await (const d of current) {
    if (textHash(buildText(d)) !== d.embeddingTextHash) ids.add(String(d._id));
  }
  return [...ids];
}

/**
 * Embed all pending rows of one catalog.
 * @param {import('mongoose').Model} Model
 * @param {(doc: object) => string} buildText  product -> embedding text
 * @param {{ chunk?: number, limit?: number, onProgress?: (done: number, total: number) => void, log?: Function }} [opts]
 * @returns {Promise<{ embedded: number, failed: number, remaining: number }>}
 */
export async function embedPending(Model, buildText, { chunk = 32, limit = Infinity, onProgress = () => {}, log = () => {} } = {}) {
  const pendingAll = await findPendingIds(Model, buildText, EMBEDDING_MODEL_ID);
  const pending = pendingAll.slice(0, limit);
  let embedded = 0;
  let failed = 0;

  const write = (doc, vector, text) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { embedding: vector, embeddingModel: EMBEDDING_MODEL_ID, embeddingTextHash: textHash(text) } },
    },
  });

  for (let i = 0; i < pending.length; i += chunk) {
    const docs = await Model.find({ _id: { $in: pending.slice(i, i + chunk) } }).select('-embedding').lean();
    const texts = docs.map((d) => buildText(d));
    try {
      const vectors = await embedDocuments(texts);
      await Model.bulkWrite(docs.map((d, k) => write(d, vectors[k], texts[k])), { ordered: false });
      embedded += docs.length;
    } catch (err) {
      // Retry one by one so a single bad row does not sink the whole chunk
      log(`chunk failed (${err.message}); retrying individually`);
      for (const [k, d] of docs.entries()) {
        try {
          const [vec] = await embedDocuments([texts[k]]);
          await Model.bulkWrite([write(d, vec, texts[k])]);
          embedded++;
        } catch (e) {
          failed++;
          log(`failed ${d._id}: ${e.message}`);
        }
      }
    }
    onProgress(embedded + failed, pending.length);
  }

  return { embedded, failed, remaining: pendingAll.length - embedded };
}

/** Embed every catalog. Lazy imports keep this module importable without loading all models. */
export async function embedAllCatalogs(opts = {}) {
  const [{ default: Clothing }, { default: Shoe }, { default: Jewelry }, { default: Watch }, text] = await Promise.all([
    import('../models/ClothingProduct.js'),
    import('../models/ShoeProduct.js'),
    import('../models/JewelryProduct.js'),
    import('../models/WatchProduct.js'),
    import('./embeddingText.js'),
  ]);
  const catalogs = [
    ['clothing', Clothing, text.buildClothingEmbeddingText],
    ['shoes', Shoe, text.buildShoeEmbeddingText],
    ['jewelry', Jewelry, text.buildJewelryEmbeddingText],
    ['watches', Watch, (p) => [p.name, p.brand, p.description, ...(p.tags || [])].filter(Boolean).join('\n')],
  ];
  const results = {};
  for (const [label, Model, build] of catalogs) {
    results[label] = await embedPending(Model, build, {
      ...opts,
      onProgress: (done, total) => process.stdout.write(`\r[${label}] ${done}/${total}   `),
    });
    process.stdout.write('\n');
  }
  return results;
}
