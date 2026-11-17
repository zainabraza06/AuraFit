import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeAgentRun, taskPassed, summarizeAgentEval } from '../services/agentEval.js';

const pick = (over = {}) => ({ id: 'a'.repeat(24), catalog: 'clothing', price: 4000, color: 'Maroon', name: 'Suit', ...over });
const run = (picks, over = {}) => ({ stopReason: 'answered', droppedUngroundedPicks: 0, picks, ...over });
const by = (checks, name) => checks.find((c) => c.name === name);

test('a good run passes every applicable check', () => {
  const task = { checks: { maxTotal: 10000, colorAny: ['maroon'], catalogsAll: ['clothing', 'shoes'] } };
  const checks = judgeAgentRun(task, run([pick(), pick({ id: 'b'.repeat(24), catalog: 'shoes', price: 3000, color: 'Gold' })]));
  assert.equal(taskPassed(checks), true, JSON.stringify(checks.filter((c) => !c.ok)));
});

test('budget: total and per-item limits fail with a useful detail', () => {
  const picks = [pick({ price: 9000 }), pick({ id: 'b'.repeat(24), price: 7000 })];
  assert.equal(by(judgeAgentRun({ checks: { maxTotal: 15000 } }, run(picks)), 'budget_total').ok, false);
  assert.equal(by(judgeAgentRun({ checks: { maxTotal: 16000 } }, run(picks)), 'budget_total').ok, true);
  const each = by(judgeAgentRun({ checks: { maxEach: 8000 } }, run(picks)), 'budget_each');
  assert.equal(each.ok, false);
  assert.match(each.detail, /9000/);
});

test('colour is matched on the pick colour or its name; a missing required catalog fails', () => {
  assert.equal(by(judgeAgentRun({ checks: { colorAny: ['green'] } }, run([pick({ color: 'Teal', name: 'Olive Green Kurta' })])), 'color').ok, true);
  assert.equal(by(judgeAgentRun({ checks: { colorAny: ['green'] } }, run([pick({ color: 'Red' })])), 'color').ok, false);
  const cat = by(judgeAgentRun({ checks: { catalogsAll: ['clothing', 'jewelry'] } }, run([pick()])), 'catalogs');
  assert.equal(cat.ok, false);
  assert.match(cat.detail, /jewelry/);
});

test('grounding, fallback answers and sold-out picks are always failures', () => {
  assert.equal(by(judgeAgentRun({ checks: {} }, run([pick()], { droppedUngroundedPicks: 2 })), 'grounded').ok, false);
  assert.equal(by(judgeAgentRun({ checks: {} }, run([pick()], { stopReason: 'budget' })), 'answered').ok, false);
  assert.equal(by(judgeAgentRun({ checks: {} }, run([pick()]), { stockById: new Map([['a'.repeat(24), false]]) }), 'in_stock').ok, false);
  assert.equal(by(judgeAgentRun({ checks: {} }, run([pick(), pick()])), 'no_duplicates').ok, false);
});

test('an honest empty answer is accepted only when the task allows it; forbidden ids never are', () => {
  assert.equal(by(judgeAgentRun({ checks: {} }, run([])), 'has_picks').ok, false);
  assert.equal(by(judgeAgentRun({ checks: { allowNoPicks: true } }, run([])), 'has_picks').ok, true);
  assert.equal(by(judgeAgentRun({ checks: { colorAny: ['red'], allowNoPicks: true } }, run([])), 'color').ok, true, 'no picks + allowed => colour not required');
  const bad = judgeAgentRun({ checks: { forbidIds: ['0'.repeat(24)], allowNoPicks: true } }, run([pick({ id: '0'.repeat(24) })]));
  assert.equal(by(bad, 'forbidden_ids').ok, false);
});

test('summarize counts passes per check, tasks passed, median/p90 latency and mean tool calls', () => {
  const rows = [
    { checks: [{ name: 'a', ok: true }, { name: 'b', ok: true }], ms: 1000, toolCalls: 2 },
    { checks: [{ name: 'a', ok: true }, { name: 'b', ok: false }], ms: 3000, toolCalls: 4 },
    { checks: [{ name: 'a', ok: false }], ms: 2000, toolCalls: 3 },
  ];
  const s = summarizeAgentEval(rows);
  assert.equal(s.tasks, 3);
  assert.equal(s.passedAll, 1);
  assert.deepEqual(s.perCheck.a, { passed: 2, of: 3 });
  assert.deepEqual(s.perCheck.b, { passed: 1, of: 2 });
  assert.equal(s.medianMs, 2000);
  assert.equal(s.meanToolCalls, 3);
});
