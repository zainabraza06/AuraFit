/**
 * embeddingJobs.js — keep every catalog's vectors in sync with the current embedding model.
 *
 * A row "needs embedding" when it has no vector, an empty vector, or a vector produced
 * by a different model (e.g. the old 384-dim MiniLM vectors). Re-running is always safe:
 * rows that are already current are skipped.
 */
import { embedDocuments, EMBEDDING_MODEL_ID } from './embeddings.js';

/** Mongo filter for rows whose vector is missing or stale. */
export function needsEmbeddingFilter(modelId = EMBEDDING_MODEL_ID) {
  return {
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
      { embeddingModel: { $ne: modelId } },
    ],
  };
}

/**
 * Embed all pending rows of one catalog.
 * @param {import('mongoose').Model} Model
 * @param {(doc: object) => string} buildText  product -> embedding text
 * @param {{ chunk?: number, limit?: number, onProgress?: (done: number, total: number) => void, log?: Function }} [opts]
 * @returns {Promise<{ embedded: number, failed: number, remaining: number }>}
 */
export async function embedPending(Model, buildText, { chunk = 32, limit = Infinity, onProgress = () => {}, log = () => {} } = {}) {
  const filter = needsEmbeddingFilter();
  const total = Math.min(await Model.countDocuments(filter), limit);
  let embedded = 0;
  let failed = 0;
  const skip = new Set(); // ids that failed this run, so one bad row cannot loop forever

  while (embedded + failed < total) {
    const docs = await Model.find({ ...filter, _id: { $nin: [...skip] } })
      .limit(Math.min(chunk, total - embedded - failed))
      .lean();
    if (!docs.length) break;

    try {
      const vectors = await embedDocuments(docs.map((d) => buildText(d)));
      await Model.bulkWrite(
        docs.map((d, i) => ({
          updateOne: { filter: { _id: d._id }, update: { $set: { embedding: vectors[i], embeddingModel: EMBEDDING_MODEL_ID } } },
        })),
        { ordered: false }
      );
      embedded += docs.length;
    } catch (err) {
      // Retry one by one so a single bad row does not sink the whole chunk
      log(`chunk failed (${err.message}); retrying individually`);
      for (const d of docs) {
        try {
          const [vec] = await embedDocuments([buildText(d)]);
          await Model.updateOne({ _id: d._id }, { $set: { embedding: vec, embeddingModel: EMBEDDING_MODEL_ID } });
          embedded++;
        } catch (e) {
          failed++;
          skip.add(d._id);
          log(`failed ${d._id}: ${e.message}`);
        }
      }
    }
    onProgress(embedded + failed, total);
  }

  const remaining = await Model.countDocuments(filter);
  return { embedded, failed, remaining };
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
