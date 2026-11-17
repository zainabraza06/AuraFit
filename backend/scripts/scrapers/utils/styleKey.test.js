import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStyleKey } from './styleKey.js';

const key = (name, productUrl, brand = 'Alkaram Studio') => deriveStyleKey({ name, productUrl, brand });

test('Alkaram: design code comes from the slug, colour is split off, colourways share a group', () => {
  const beige = key('RTS | SHIRT, TROUSER & DUPATTA', 'https://www.alkaramstudio.com/products/rts-shirt-trouser-dupatta-ec327-3p26-beige');
  const blue = key('RTS | SHIRT, TROUSER & DUPATTA', 'https://www.alkaramstudio.com/products/rts-shirt-trouser-dupatta-ec327-3p26-blue');
  const other = key('RTS | SHIRT, TROUSER & DUPATTA', 'https://www.alkaramstudio.com/products/rts-shirt-trouser-dupatta-ec345-3p26b-beige');
  assert.equal(beige.styleCode, 'EC327-3P26');
  assert.equal(beige.colorToken, 'beige');
  assert.equal(beige.styleGroup, blue.styleGroup, 'same design, other colour => same group');
  assert.notEqual(beige.styleGroup, other.styleGroup, 'different design => different group');
  assert.equal(other.styleCode, 'EC345-3P26B');
});

test('Khaadi: code and colour from the file name with underscore colour', () => {
  const k = key('Fabrics 3 Piece', 'https://pk.khaadi.com/fabrics-3-piece/A1G1-26-407FA-E-VG_MULTI.html', 'Khaadi');
  assert.equal(k.styleCode, 'A1G1-26-407FA-E-VG');
  assert.equal(k.colorToken, 'multi');
});

test('Limelight: product code without a colour still yields a code and group', () => {
  const k = key('3 Piece Khaddar Suit- Embroidered (Unstitched)', 'https://www.limelight.pk/products/u5337su-3pc-091', 'Limelight');
  assert.equal(k.styleCode, 'U5337SU-3PC-091');
  assert.equal(k.colorToken, undefined);
  assert.equal(k.styleGroup, 'limelight:u5337su-3pc-091');
});

test('descriptive slugs with no digits and slugs identical to the title give no key', () => {
  assert.deepEqual(key('Solid Cotton Kurta', 'https://x.pk/products/solid-cotton-kurta'), {});
  assert.deepEqual(key('Emerald Lawn Suit', 'https://x.pk/products/emerald-lawn-suit-embroidered-festive'), {});
});

test('bad or empty URLs never throw', () => {
  assert.deepEqual(deriveStyleKey({ name: 'x', productUrl: '' }), {});
  assert.deepEqual(deriveStyleKey({ name: 'x', productUrl: 'not a url' }), {});
  assert.deepEqual(deriveStyleKey({}), {});
});
