/**
 * visualSearch.js — rank products by how their PHOTO looks, using CLIP image vectors.
 *
 *   searchByImageVector(vec)   cosine against every product's imageEmbedding (cached, Float32)
 *   fuseRankings(a, b)         reciprocal-rank fusion of two ranked lists (visual + description-based)
 *
 * Fusion rather than replacement: CLIP sees print/silhouette that a text description cannot, but the
 * description path knows hard facets (catalog, colour family, occasion). RRF combines them without
 * having to calibrate two different score scales.
 */
import { CATALOGS } from './crossCatalogSearch.js';
import { loadCandidates } from './vectorCache.js';
import { IMAGE_EMBEDDING_MODEL_ID } from './imageEmbeddings.js';
import { parseGenderFilter } from '../utils/catalogQuery.js';
import { useAtlas, vectorSearch, buildFilter } from './atlasVector.js';

function dot(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // both unit length => cosine
}

/**
 * @param {number[]} vector unit-length CLIP vector (image OR text)
 * @param {{ catalog?: string, gender?: string, limit?: number, minScore?: number }} [opts]
 */
export async function searchByImageVector(vector, { catalog, gender, limit = 30, minScore = 0 } = {}) {
  const wanted = catalog ? CATALOGS.filter((c) => c.key === catalog) : CATALOGS;
  const genders = parseGenderFilter(gender);
  const q = Float32Array.from(vector);
  const perCatalog = await Promise.all(
    wanted.map(async ({ key, Model, fields }) => {
      if (await useAtlas(Model)) {
        try {
          const projection = fields.split(' ').filter((f) => f !== 'embedding').reduce((o, f) => ({ ...o, [f]: 1 }), {});
          const hits = await vectorSearch(Model, {
            path: 'imageEmbedding',
            vector: q,
            filter: buildFilter({ modelField: 'imageEmbeddingModel', modelId: IMAGE_EMBEDDING_MODEL_ID, genders }),
            limit,
            numCandidates: Math.max(limit * 10, 200),
            projection,
          });
          return hits.map(({ cosine, ...d }) => ({ d, key, score: cosine }));
        } catch (e) {
          console.warn(`[visual] Atlas vector search failed for ${key} (${String(e.message).slice(0, 100)}); using the in-process search`);
        }
      }
      const match = { imageEmbedding: { $exists: true, $ne: [] }, imageEmbeddingModel: IMAGE_EMBEDDING_MODEL_ID, inStock: { $ne: false } };
      const projection = fields.split(' ').filter((f) => f !== 'embedding').reduce((o, f) => ({ ...o, [f]: 1 }), { imageEmbedding: 1 });
      const docs = await loadCandidates(Model, `${key}:img`, match, projection, { field: 'imageEmbedding' });
      return docs
        .filter((d) => !genders || genders.includes(d.gender))
        .map((d) => ({ d, key, score: dot(q, d.imageEmbedding) }));
    }),
  );
  return perCatalog
    .flat()
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d, key, score }) => {
      const { imageEmbedding, ...rest } = d;
      return { ...rest, catalog: key, visualScore: parseFloat(score.toFixed(4)) };
    });
}

const idOf = (p) => String(p._id ?? p.productUrl);

/**
 * Reciprocal-rank fusion. Items appearing in both lists rise; ties keep list-A order.
 * @param {object[]} listA ranked best-first
 * @param {object[]} listB ranked best-first
 */
export function fuseRankings(listA, listB, { k = 60, weightA = 1, weightB = 1 } = {}) {
  const scores = new Map();
  const items = new Map();
  const add = (list, w) => list.forEach((p, i) => {
    const id = idOf(p);
    scores.set(id, (scores.get(id) || 0) + w / (k + i + 1));
    items.set(id, { ...(items.get(id) || {}), ...p });
  });
  add(listA, weightA);
  add(listB, weightB);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, s]) => ({ ...items.get(id), fusedScore: parseFloat((s * 1000).toFixed(3)) }));
}
