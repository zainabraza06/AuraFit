import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSearchQuery, buildSemanticQueryText, inferCatalogHints } from '../services/searchQueryIntel.js';

test('product-type nouns map to their catalog; clothing queries have no hint', () => {
  assert.deepEqual(inferCatalogHints('kundan choker'), ['jewelry']);
  assert.deepEqual(inferCatalogHints('black heels for a party'), ['shoes']);
  assert.deepEqual(inferCatalogHints('golden watch'), ['watches']);
  assert.deepEqual(inferCatalogHints('white kurta for eid'), []);
  assert.deepEqual(inferCatalogHints('bracelet watch'), ['watches'], 'head-final: the last product word is what is asked for');
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

import { collapseByStyleGroup } from '../services/crossCatalogSearch.js';

test('colourways of one design collapse into the best-scoring one; unkeyed products are never merged', () => {
  const ranked = [
    { name: 'A beige', styleGroup: 'b:ec327' },
    { name: 'X', styleGroup: undefined },
    { name: 'A blue', styleGroup: 'b:ec327' },
    { name: 'Y', styleGroup: undefined },
    { name: 'B', styleGroup: 'b:ec345' },
    { name: 'A red', styleGroup: 'b:ec327' },
  ];
  const out = collapseByStyleGroup(ranked);
  assert.deepEqual(out.map((p) => p.name), ['A beige', 'X', 'Y', 'B']);
  assert.equal(out[0]._variants, 3);
  assert.equal(out[3]._variants, undefined);
});

test('head-final compounds: "bracelet watch" asks for a watch; lists keep every catalog', () => {
  assert.deepEqual(inferCatalogHints('ladies bracelet watch'), ['watches']);
  assert.deepEqual(inferCatalogHints('watch bracelet'), ['jewelry'], 'the last product word is the head');
  const set = (q) => [...inferCatalogHints(q)].sort();
  assert.deepEqual(set('black heels and gold earrings'), ['jewelry', 'shoes']);
  assert.deepEqual(set('sandals, necklace'), ['jewelry', 'shoes']);
  assert.deepEqual(set('shoes with a watch'), ['shoes', 'watches']);
  assert.deepEqual(inferCatalogHints('gold jhumka earrings'), ['jewelry'], 'one catalog stays one catalog');
  assert.deepEqual(inferCatalogHints('sandal'), ['shoes'], '"and" inside "sandal" is not a conjunction');
  assert.deepEqual(inferCatalogHints('golden band watch'), ['watches']);
});

import { keywordTerms, keywordScore } from '../services/crossCatalogSearch.js';

test('keywordTerms drops stop words, amounts and currency; keeps the product words', () => {
  assert.deepEqual(keywordTerms('a white kurta for eid under 8000 PKR'), ['white', 'kurta', 'eid']);
  assert.deepEqual(keywordTerms('my budget is 8k rupees, green outfit with shoes'), ['green', 'shoes']);
  assert.deepEqual(keywordTerms(''), []);
  assert.deepEqual(keywordTerms('Kurta kurta KURTA'), ['kurta'], 'deduplicated');
});

test('keywordScore ranks a white kurta above white trousers and above a red kurta', () => {
  const terms = ['white', 'kurta'];
  const whiteKurta = { name: 'Cotton Kurta', primaryColor: 'White', colors: ['White'] };
  const whitePants = { name: 'Wide Leg Pants', primaryColor: 'White', colors: ['White'] };
  const redKurta = { name: 'Embroidered Kurta', primaryColor: 'Red', colors: ['Red'] };
  const score = (d) => keywordScore(d, terms, ['white']);
  assert.ok(score(whiteKurta) > score(whitePants), 'matches both words and the colour');
  assert.ok(score(whiteKurta) > score(redKurta));
  assert.equal(keywordScore({ name: 'x' }, [], []), 0);
});
