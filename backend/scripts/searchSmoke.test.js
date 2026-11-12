import test from 'node:test';
import assert from 'node:assert/strict';
import { checkResults, SMOKE_QUERIES } from './searchSmoke.js';

const hit = (over = {}) => ({ catalog: 'clothing', inStock: true, name: 'Suit', ...over });

test('healthy results produce no problems', () => {
  assert.deepEqual(checkResults('q', 'clothing', [hit(), hit()]), []);
});

test('empty results, sold-out items and a wrong-catalog top hit are each reported', () => {
  assert.match(checkResults('q', 'clothing', [])[0], /no results/);
  assert.match(checkResults('q', 'clothing', [hit({ inStock: false })])[0], /sold-out/);
  assert.match(checkResults('q', 'shoes', [hit({ catalog: 'clothing' })])[0], /expected "shoes"/);
});

test('no catalog expectation means any catalog is fine', () => {
  assert.deepEqual(checkResults('q', undefined, [hit({ catalog: 'jewelry' })]), []);
});

test('the query set covers every catalog', () => {
  const catalogs = new Set(SMOKE_QUERIES.map(([, c]) => c));
  for (const c of ['clothing', 'shoes', 'jewelry']) assert.ok(catalogs.has(c), c);
});
