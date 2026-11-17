import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, stripHtml, cleanName, normalizeShoutingName } from './textClean.js';

test('decodes the entities seen in the live catalog', () => {
  assert.equal(decodeEntities('Neckline &amp; Sleeve'), 'Neckline & Sleeve');
  assert.equal(decodeEntities('a&nbsp;b'), 'a b');
  assert.equal(decodeEntities('it&#39;s &#x41;'), "it's A");
  assert.equal(decodeEntities('50&ndash;60'), '50–60');
});

test('leaves unknown or malformed entities untouched', () => {
  assert.equal(decodeEntities('&bogus; &#999999999; AT&T'), '&bogus; &#999999999; AT&T');
});

test('strips tags and decodes, collapsing whitespace', () => {
  assert.equal(stripHtml('<p>Shirt &amp; Trouser</p><ul><li>Lawn</li><li>Dupatta</li></ul>'), 'Shirt & Trouser Lawn Dupatta');
});

test('escaped markup stays text and is not re-interpreted as a tag', () => {
  assert.equal(stripHtml('&lt;b&gt;bold&lt;/b&gt;'), '<b>bold</b>');
});

test('drops script/style bodies', () => {
  assert.equal(stripHtml('Hi<script>alert(1)</script><style>p{}</style>there'), 'Hi there');
});

test('respects maxLen', () => {
  assert.equal(stripHtml('abcdef', 3), 'abc');
});

test('cleanName trims separators and fixes spacing', () => {
  assert.equal(cleanName('  3 Piece Suit &amp; Dupatta - '), '3 Piece Suit & Dupatta');
  assert.equal(cleanName('Lawn  Suit , Blue'), 'Lawn Suit, Blue');
});

// ── ALL-CAPS titles ──
test('ALL-CAPS titles become Title Case; codes and abbreviations keep their case', () => {
  assert.equal(normalizeShoutingName('VISCOSE SLUB SHIRT (PRET)'), 'Viscose Slub Shirt (Pret)');
  assert.equal(normalizeShoutingName('RTW | SHIRT, TROUSER & DUPATTA'), 'RTW | Shirt, Trouser & Dupatta');
  assert.equal(normalizeShoutingName('3 PIECE PRINTED LAWN SUIT-WHIMSICAL DUSK'), '3 Piece Printed Lawn Suit-Whimsical Dusk');
  assert.equal(normalizeShoutingName('GOLDEN FANCY BRIDAL SANDAL FN6375'), 'Golden Fancy Bridal Sandal FN6375');
  assert.equal(normalizeShoutingName("WOMEN'S LEATHER BAG"), "Women's Leather Bag");
});

test('mixed-case, short and non-letter titles are left alone', () => {
  assert.equal(normalizeShoutingName('Khaadi Lawn Suit'), 'Khaadi Lawn Suit');
  assert.equal(normalizeShoutingName('Surkhi'), 'Surkhi');
  assert.equal(normalizeShoutingName('J. Signature'), 'J. Signature');
  assert.equal(normalizeShoutingName('ABC'), 'ABC', 'too short to be sure it is shouting');
  assert.equal(normalizeShoutingName('3PC'), '3PC');
  assert.equal(normalizeShoutingName(''), '');
  assert.equal(normalizeShoutingName(null), '');
});

test('cleanName un-shouts after stripping tags and entities', () => {
  assert.equal(cleanName('<b>PRINTED &amp; EMBROIDERED KURTA</b>'), 'Printed & Embroidered Kurta');
});
