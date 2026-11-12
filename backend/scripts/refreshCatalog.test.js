import test from 'node:test';
import assert from 'node:assert/strict';
import { findProblems, renderSummary } from './refreshCatalog.js';

const snap = (over = {}) => ({
  clothing: { total: 500, inStock: 400, outOfStock: 100, unembedded: 0 },
  shoes: { total: 100, inStock: 80, outOfStock: 20, unembedded: 0 },
  ...over,
});

test('healthy run has no problems', () => {
  assert.deepEqual(findProblems(snap(), snap({ clothing: { total: 520, inStock: 410, outOfStock: 110, unembedded: 0 } })), []);
});

test('a catalog losing most of its in-stock products is flagged (likely blocked scrape)', () => {
  const after = snap({ shoes: { total: 100, inStock: 10, outOfStock: 90, unembedded: 0 } });
  const p = findProblems(snap(), after);
  assert.equal(p.length, 1);
  assert.match(p[0], /shoes: in-stock products fell from 80 to 10/);
});

test('small catalogs are not judged by the drop rule', () => {
  const before = snap({ shoes: { total: 10, inStock: 8, outOfStock: 2, unembedded: 0 } });
  const after = snap({ shoes: { total: 10, inStock: 1, outOfStock: 9, unembedded: 0 } });
  assert.deepEqual(findProblems(before, after), []);
});

test('missing embeddings and failed embeds are reported', () => {
  const after = snap({ clothing: { total: 500, inStock: 400, outOfStock: 100, unembedded: 7 } });
  const p = findProblems(snap(), after, { embedFailed: 2 });
  assert.ok(p.some((x) => /clothing: 7 in-stock products still have no current embedding/.test(x)));
  assert.ok(p.some((x) => /2 embedding\(s\) failed/.test(x)));
});

test('summary shows per-catalog deltas and the problems', () => {
  const after = snap({ clothing: { total: 520, inStock: 410, outOfStock: 110, unembedded: 0 } });
  const md = renderSummary(snap(), after, ['something odd'], 42);
  assert.match(md, /Weekly catalog refresh \(42 min\)/);
  assert.match(md, /\| clothing \| 520 \(\+20\) \| 410 \(\+10\) \| 110 \| 0 \|/);
  assert.match(md, /- something odd/);
});
