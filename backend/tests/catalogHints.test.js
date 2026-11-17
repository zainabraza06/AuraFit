import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSearchQuery, buildSemanticQueryText, inferCatalogHints } from '../services/searchQueryIntel.js';

test('product-type nouns map to their catalog; clothing queries have no hint', () => {
  assert.deepEqual(inferCatalogHints('kundan choker'), ['jewelry']);
  assert.deepEqual(inferCatalogHints('black heels for a party'), ['shoes']);
  assert.deepEqual(inferCatalogHints('golden watch'), ['watches']);
  assert.deepEqual(inferCatalogHints('white kurta for eid'), []);
  assert.deepEqual(inferCatalogHints('bracelet watch'), ['jewelry', 'watches']);
});

test('word boundaries: "ring" does not fire inside other words, but "earrings" does fire as jewelry', () => {
  assert.deepEqual(inferCatalogHints('spring string lawn'), []);
  assert.deepEqual(inferCatalogHints('gold ring'), ['jewelry']);
  assert.deepEqual(inferCatalogHints('pearl earrings'), ['jewelry']);
  assert.deepEqual(inferCatalogHints('shoe rack'), ['shoes']);
});

test('the embedded query no longer says "clothing outfit" for accessory queries', () => {
  assert.match(buildSemanticQueryText(analyzeSearchQuery('kundan choker')), /Fashion jewelry product search\./);
  assert.doesNotMatch(buildSemanticQueryText(analyzeSearchQuery('kundan choker')), /clothing outfit/);
  assert.match(buildSemanticQueryText(analyzeSearchQuery('red lehnga')), /Fashion clothing outfit search\./);
});
