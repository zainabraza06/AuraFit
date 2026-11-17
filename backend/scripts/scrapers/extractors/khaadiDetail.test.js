import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKhaadiDetailHtml } from './khaadiExtractor.js';

const fx = (name) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures', name), 'utf8');

test('in-stock page: available, with a real description', () => {
  const d = parseKhaadiDetailHtml(fx('khaadi_pdp_instock.html'));
  assert.equal(d.available, true);
  assert.ok(d.description.length > 80, `description too short: ${d.description}`);
  assert.ok(!/<[a-z]|&amp;|&nbsp;/i.test(d.description));
});

test('out-of-stock page is detected as unavailable (previously every Khaadi row was stored in stock)', () => {
  const d = parseKhaadiDetailHtml(fx('khaadi_pdp_outofstock.html'));
  assert.equal(d.available, false);
});

test('set-variant options like 3PC are not treated as garment sizes', () => {
  const html = '<div class="size-item"><input id="3PC" value="x"></div><div class="size-item"><input id="M" value="y"></div><div class="size-item"><input id="xl"></div>';
  assert.deepEqual(parseKhaadiDetailHtml(html).sizes, ['M', 'XL']);
});

test('falls back to the visible out-of-stock message when JSON-LD is absent', () => {
  assert.equal(parseKhaadiDetailHtml('<div class="availability">Item is currently Out of Stock</div>').available, false);
  assert.equal(parseKhaadiDetailHtml('<p>nothing useful</p>').available, undefined);
});

test('malformed JSON-LD does not throw', () => {
  assert.doesNotThrow(() => parseKhaadiDetailHtml('<script type="application/ld+json">{oops</script>'));
});
