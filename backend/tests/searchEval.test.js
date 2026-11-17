import test from 'node:test';
import assert from 'node:assert/strict';
import { isRelevant, gradeProduct, relevantSet, queryMetrics, aggregate, regressions } from '../services/searchEval.js';

const spec = { id: 'white-kurta', query: 'white kurta', catalog: 'clothing', clauses: [{ any: ['white', 'ivory'], fields: 'color' }, { any: ['kurta', 'kurti'] }] };
const P = (name, color, extra = {}) => ({ name, primaryColor: color, colors: [color], catalog: 'clothing', ...extra });

test('relevance needs every clause; colour clause looks at colour fields, others at the text', () => {
  assert.equal(isRelevant(P('Embroidered Kurta', 'White'), spec), true);
  assert.equal(isRelevant(P('Plain Kurti', 'Ivory'), spec), true);
  assert.equal(isRelevant(P('Embroidered Kurta', 'Black'), spec), false);
  assert.equal(isRelevant(P('Lawn Suit', 'White'), spec), false);
  assert.equal(gradeProduct(P('Lawn Suit', 'White'), spec), 1);
  // prefix on a word boundary: "kurtas" counts, "skurta" does not
  assert.equal(isRelevant(P('Kurtas Set', 'White'), spec), true);
  assert.equal(isRelevant(P('Skurta', 'White'), spec), false);
});

test('relevantSet respects the catalog and metrics are computed against the FULL relevant set', () => {
  const all = [P('A Kurta', 'White'), P('B Kurta', 'White'), P('C Kurta', 'White'), P('Shoe Kurta', 'White', { catalog: 'shoes' }), P('D Suit', 'Red')];
  const rel = relevantSet(all, spec);
  assert.equal(rel.length, 3);

  const ranked = [P('Lawn Suit', 'White'), P('A Kurta', 'White'), P('B Kurta', 'White')];
  const m = queryMetrics(ranked, spec, rel.length, 3);
  assert.equal(m.hits, 2);
  assert.equal(m.rr, 0.5, 'first relevant at rank 2');
  assert.ok(Math.abs(m.precision - 2 / 3) < 1e-9);
  assert.ok(Math.abs(m.recall - 2 / 3) < 1e-9, '2 of the 3 relevant items retrieved');
  assert.ok(m.ndcg > 0 && m.ndcg < 1);
});

test('a perfect ranking scores 1 on every metric; an empty one scores 0', () => {
  const perfect = [P('A Kurta', 'White'), P('B Kurta', 'White')];
  const m = queryMetrics(perfect, spec, 2, 5);
  assert.deepEqual([m.precision, m.recall, m.rr, m.ndcg], [1, 1, 1, 1]);
  const none = queryMetrics([], spec, 2, 5);
  assert.deepEqual([none.precision, none.recall, none.rr, none.ndcg], [0, 0, 0, 0]);
});

test('recall is capped at k so a huge relevant set does not make recall@10 impossible', () => {
  const ten = Array.from({ length: 10 }, (_, i) => P(`K${i} Kurta`, 'White'));
  assert.equal(queryMetrics(ten, spec, 500, 10).recall, 1);
});

test('aggregate skips queries with no relevant products but reports them', () => {
  const agg = aggregate([
    { id: 'a', metrics: { relevantTotal: 5, precision: 1, recall: 1, rr: 1, ndcg: 1 } },
    { id: 'b', metrics: { relevantTotal: 5, precision: 0, recall: 0, rr: 0, ndcg: 0 } },
    { id: 'c', metrics: { relevantTotal: 0, precision: 0, recall: null, rr: 0, ndcg: null } },
  ]);
  assert.equal(agg.scored, 2);
  assert.deepEqual(agg.unanswerable, ['c']);
  assert.equal(agg.mrr, 0.5);
});

test('regressions flags drops beyond the tolerance only', () => {
  const base = { precision: 0.8, recall: 0.8, mrr: 0.9, ndcg: 0.8 };
  assert.deepEqual(regressions({ precision: 0.78, recall: 0.8, mrr: 0.9, ndcg: 0.8 }, base), []);
  const bad = regressions({ precision: 0.6, recall: 0.8, mrr: 0.5, ndcg: 0.8 }, base);
  assert.equal(bad.length, 2);
  assert.deepEqual(regressions({ mrr: 0 }, null), []);
});

test('a result from another catalog is never relevant, so recall cannot exceed 1', () => {
  const spec = { id: 'w', query: 'ladies watch', catalog: 'watches', clauses: [{ any: ['women'] }] };
  const watch = { name: "Fluted Curve Women's Watch", catalog: 'watches' };
  const jewelry = { name: "Women's Bracelet", catalog: 'jewelry' };
  assert.equal(isRelevant(watch, spec), true);
  assert.equal(isRelevant(jewelry, spec), false);
  const m = queryMetrics([jewelry, jewelry, watch], spec, 1, 3);
  assert.equal(m.hits, 1);
  assert.ok(m.recall <= 1);
  assert.equal(m.rr, 1 / 3);
});
