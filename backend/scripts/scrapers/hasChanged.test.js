import test from 'node:test';
import assert from 'node:assert/strict';

// index.js connects to nothing on import (the runner only starts when executed directly)
const { hasChanged } = await import('./index.js');

const base = { price: 100, compareAtPrice: 0, name: 'Suit', description: 'Lawn', imageUrl: 'a.jpg', sizes: ['M'] };

test('identical rows are unchanged', () => {
  assert.equal(hasChanged(base, { ...base }), false);
});

test('a description-only change counts as a change (regression: Khaadi descriptions were never written)', () => {
  assert.equal(hasChanged({ ...base, description: '' }, { ...base, description: 'Top Fabric: Lawn' }), true);
});

test('missing vs empty description is not a change', () => {
  const { description, ...noDesc } = base;
  assert.equal(hasChanged(noDesc, { ...base, description: '' }), false);
});

test('price, name and sizes changes are still detected', () => {
  assert.equal(hasChanged(base, { ...base, price: 90 }), true);
  assert.equal(hasChanged(base, { ...base, name: 'Suit 2' }), true);
  assert.equal(hasChanged(base, { ...base, sizes: ['S', 'M'] }), true);
});
