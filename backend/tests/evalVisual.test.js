import test from 'node:test';
import assert from 'node:assert/strict';
import { similarityMetrics } from '../scripts/evalVisual.js';

test('similarityMetrics: same catalog and same type are measured separately', () => {
  const q = { catalog: 'shoes', shoeType: 'heel' };
  const results = [
    { catalog: 'shoes', shoeType: 'heel' },
    { catalog: 'shoes', shoeType: 'flats' },
    { catalog: 'jewelry', jewelryType: 'ring' },
    { catalog: 'shoes', shoeType: 'heel' },
  ];
  const m = similarityMetrics(q, results, 4);
  assert.equal(m.sameCatalog, 0.75);
  assert.equal(m.sameType, 0.5);
  assert.equal(m.n, 4);
});

test('a query product without a usable type is not scored on type; empty results score zero', () => {
  assert.equal(similarityMetrics({ catalog: 'jewelry', jewelryType: 'other' }, [{ catalog: 'jewelry' }], 5).sameType, null);
  assert.equal(similarityMetrics({ catalog: 'jewelry' }, [{ catalog: 'jewelry' }], 5).sameType, null);
  assert.deepEqual(similarityMetrics({ catalog: 'shoes', shoeType: 'heel' }, [], 5), { sameCatalog: 0, sameType: 0, n: 0 });
});
