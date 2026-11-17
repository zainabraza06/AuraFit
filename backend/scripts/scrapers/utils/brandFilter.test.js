import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOnlyBrands, brandAllowed } from './brandFilter.js';

test('empty or unset allows every brand', () => {
  assert.deepEqual(parseOnlyBrands(''), []);
  assert.equal(brandAllowed('Khaadi', []), true);
});

test('matches case-insensitively and ignores spaces around commas', () => {
  const only = parseOnlyBrands(' khaadi , Maria B ,');
  assert.deepEqual(only, ['khaadi', 'maria b']);
  assert.equal(brandAllowed('Khaadi', only), true);
  assert.equal(brandAllowed('MARIA B', only), true);
  assert.equal(brandAllowed('Limelight', only), false);
});
