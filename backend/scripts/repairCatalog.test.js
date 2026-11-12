import test from 'node:test';
import assert from 'node:assert/strict';
import { repairPatch } from './repairCatalog.js';

test('cleans dirty text and leaves clean rows alone', () => {
  assert.deepEqual(repairPatch({ name: 'Suit &amp; Dupatta', description: 'Neckline &amp; Sleeve' }), { name: 'Suit & Dupatta', description: 'Neckline & Sleeve' });
  assert.equal(repairPatch({ name: 'Plain Suit', description: 'Fabric: Lawn & cotton' }), null);
});

test('a legitimate ampersand is not rewritten', () => {
  assert.equal(repairPatch({ name: 'Shirt & Trouser', description: 'Shirt & Trouser set' }), null);
});

test('handles missing fields', () => {
  assert.equal(repairPatch({}), null);
  assert.deepEqual(repairPatch({ name: 'A &amp; B' }), { name: 'A & B' });
});
