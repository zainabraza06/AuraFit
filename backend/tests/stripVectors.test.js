import test from 'node:test';
import assert from 'node:assert/strict';
import { stripVectors } from '../utils/stripVectors.js';

test('removes embedding vectors at any depth, in arrays and nested objects', () => {
  const out = stripVectors({
    source: { _id: 1, name: 'a', embedding: [1, 2, 3] },
    shoes: [{ product: { _id: 2, embedding: [4], imageEmbedding: [5], name: 'b' }, reason: 'r' }],
    n: 3,
  });
  assert.deepEqual(out, { source: { _id: 1, name: 'a' }, shoes: [{ product: { _id: 2, name: 'b' }, reason: 'r' }], n: 3 });
});

test('leaves everything else alone: dates, null, primitives, other arrays', () => {
  const d = new Date('2026-01-01');
  assert.equal(stripVectors(d), d);
  assert.equal(stripVectors(null), null);
  assert.equal(stripVectors('x'), 'x');
  assert.deepEqual(stripVectors({ colors: ['red'], when: d }), { colors: ['red'], when: d });
});

test('does not mutate its input (the engine keeps using the vectors it scored with)', () => {
  const input = { p: { embedding: [1] } };
  stripVectors(input);
  assert.deepEqual(input, { p: { embedding: [1] } });
});
