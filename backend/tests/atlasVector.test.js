import test from 'node:test';
import assert from 'node:assert/strict';
import { useAtlas, indexDefinition, buildFilter, buildPipeline, scoreToCosine, vectorBackendMode, VECTOR_INDEX_NAME, FILTER_FIELDS } from '../services/atlasVector.js';

test('index definition holds both vector fields (cosine) and every filter field', () => {
  const def = indexDefinition();
  const vec = def.fields.filter((f) => f.type === 'vector');
  assert.deepEqual(vec.map((f) => [f.path, f.numDimensions, f.similarity]), [['embedding', 1024, 'cosine'], ['imageEmbedding', 512, 'cosine']]);
  assert.deepEqual(def.fields.filter((f) => f.type === 'filter').map((f) => f.path), FILTER_FIELDS);
});

test('filter: in stock + the current model, optional gender and category', () => {
  const f = buildFilter({ modelField: 'embeddingModel', modelId: 'm1', genders: ['women', 'unisex'], category: 'stitched' });
  assert.deepEqual(f, { $and: [{ inStock: { $ne: false } }, { embeddingModel: { $eq: 'm1' } }, { gender: { $in: ['women', 'unisex'] } }, { category: { $eq: 'stitched' } }] });
  const bare = buildFilter({ modelField: 'imageEmbeddingModel', modelId: 'clip' });
  assert.equal(bare.$and.length, 2);
});

test('every field used in a filter is declared as a filter field in the index', () => {
  const f = buildFilter({ modelField: 'embeddingModel', modelId: 'm', genders: ['women'], category: 'x' });
  for (const c of f.$and) assert.ok(FILTER_FIELDS.includes(Object.keys(c)[0]), `${Object.keys(c)[0]} is not an index filter field`);
});

test('pipeline: ANN uses numCandidates (capped at 10000), exact omits it', () => {
  const ann = buildPipeline({ path: 'embedding', vector: new Float32Array([1, 0]), filter: {}, limit: 300, numCandidates: 50_000 });
  assert.equal(ann[0].$vectorSearch.index, VECTOR_INDEX_NAME);
  assert.equal(ann[0].$vectorSearch.numCandidates, 10_000);
  assert.deepEqual(ann[0].$vectorSearch.queryVector, [1, 0]);
  assert.deepEqual(ann[1].$project._vsScore, { $meta: 'vectorSearchScore' });
  const small = buildPipeline({ path: 'embedding', vector: [1], filter: {}, limit: 100, numCandidates: 10 });
  assert.equal(small[0].$vectorSearch.numCandidates, 100, 'numCandidates is never below limit');
  const exact = buildPipeline({ path: 'embedding', vector: [1], filter: {}, limit: 5, exact: true });
  assert.equal(exact[0].$vectorSearch.exact, true);
  assert.equal('numCandidates' in exact[0].$vectorSearch, false);
});

test('Atlas cosine score (0..1) maps back to cosine (-1..1)', () => {
  assert.equal(scoreToCosine(1), 1);
  assert.equal(scoreToCosine(0.5), 0);
  assert.equal(scoreToCosine(0), -1);
});

test('backend mode: memory only when asked, otherwise auto', () => {
  const prev = process.env.VECTOR_BACKEND;
  process.env.VECTOR_BACKEND = 'memory'; assert.equal(vectorBackendMode(), 'memory');
  process.env.VECTOR_BACKEND = 'atlas'; assert.equal(vectorBackendMode(), 'auto');
  delete process.env.VECTOR_BACKEND; assert.equal(vectorBackendMode(), 'auto');
  if (prev !== undefined) process.env.VECTOR_BACKEND = prev;
});

test('without a database connection the in-process search is used (never throws)', async () => {
  const fakeModel = { collection: { collectionName: 'x', listSearchIndexes: () => { throw new Error('should not be asked'); } } };
  assert.equal(await useAtlas(fakeModel), false);
});
