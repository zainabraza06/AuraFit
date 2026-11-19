import test from 'node:test';
import assert from 'node:assert/strict';
import { seeded, colorsOf, sharesOccasion, genderOk } from '../scripts/evalOutfits.js';

test('seeded PRNG is reproducible and spreads over [0,1)', () => {
  const a = seeded(1); const b = seeded(1); const c = seeded(2);
  const xs = Array.from({ length: 5 }, a);
  assert.deepEqual(xs, Array.from({ length: 5 }, b));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, c));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('helpers: colours, occasion overlap (case-insensitive) and gender compatibility', () => {
  assert.deepEqual(colorsOf({ primaryColor: 'Red', colors: ['Gold'] }), ['Red', 'Gold']);
  assert.deepEqual(colorsOf({}), []);
  assert.equal(sharesOccasion({ occasion: ['Eid'] }, { occasion: ['eid', 'party'] }), true);
  assert.equal(sharesOccasion({ occasion: ['eid'] }, { occasion: ['office'] }), false);
  assert.equal(genderOk({ gender: 'women' }, { gender: 'men' }), false);
  assert.equal(genderOk({ gender: 'women' }, { gender: 'unisex' }), true);
  assert.equal(genderOk({ gender: 'women' }, {}), true);
});
