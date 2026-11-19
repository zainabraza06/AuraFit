import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBudget, requestedCatalogs, findViolations, violationFeedback } from '../services/agent/constraints.js';

test('parseBudget: total by default, each when the shopper says so, ignores numbers without a currency', () => {
  assert.deepEqual(parseBudget('a green mehndi outfit with shoes, my budget is 8000 PKR in total'), { total: 8000 });
  assert.deepEqual(parseBudget('a yellow lawn suit for summer, each piece under 6000 PKR'), { each: 6000 });
  assert.deepEqual(parseBudget('gold jhumka earrings under 3,000 Rs'), { total: 3000 });
  assert.deepEqual(parseBudget('something under 8k PKR'), { total: 8000 });
  assert.deepEqual(parseBudget('a kurta for my brother, he is 25'), {}, '25 is an age, not a budget');
  assert.deepEqual(parseBudget('a white kurta for eid'), {});
  assert.deepEqual(parseBudget(''), {});
});

test('requestedCatalogs: only non-clothing catalogs that are named', () => {
  assert.deepEqual(requestedCatalogs('a green mehndi outfit with shoes'), ['shoes']);
  assert.deepEqual(requestedCatalogs('navy blue formal dress with matching jewelry').sort(), ['jewelry']);
  assert.deepEqual(requestedCatalogs('a full bridal look: a red lehnga, jewelry and shoes').sort(), ['jewelry', 'shoes']);
  assert.deepEqual(requestedCatalogs('a watch for a child'), ['watches']);
  assert.deepEqual(requestedCatalogs('a white kurta for eid'), []);
  assert.deepEqual(requestedCatalogs('lace trimmed cotton suit'), [], 'no accidental word matches');
});

test('findViolations: the two real failures from the agent eval are caught', () => {
  const mehndi = [{ catalog: 'clothing', price: 3990 }, { catalog: 'shoes', price: 2370 }, { catalog: 'jewelry', price: 2000 }];
  const v = findViolations('a green mehndi outfit with shoes, my budget is 8000 PKR in total', mehndi);
  assert.deepEqual(v.map((x) => x.type), ['budget_total']);
  assert.match(v[0].detail, /8360/);

  const navy = findViolations('a navy blue formal dress with matching jewelry', [{ catalog: 'clothing', price: 9000 }]);
  assert.deepEqual(navy.map((x) => x.type), ['missing_catalog']);
});

test('findViolations: satisfied requests, empty answers and each-limits', () => {
  assert.deepEqual(findViolations('green outfit with shoes, 8000 PKR in total', [{ catalog: 'clothing', price: 3990 }, { catalog: 'shoes', price: 2370 }]), []);
  assert.deepEqual(findViolations('a kurta for my brother', []), [], 'an honest empty answer is never a violation');
  const each = findViolations('suits, each under 5000 PKR', [{ catalog: 'clothing', price: 4000 }, { catalog: 'clothing', price: 7000 }]);
  assert.deepEqual(each.map((x) => x.type), ['budget_each']);
});

test('violationFeedback names every problem', () => {
  const text = violationFeedback([{ type: 'a', detail: 'first problem' }, { type: 'b', detail: 'second problem' }]);
  assert.match(text, /first problem/);
  assert.match(text, /second problem/);
  assert.match(text, /new "final" answer/);
});
