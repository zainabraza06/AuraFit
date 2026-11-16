/**
 * Regression: ~40 clothing items (mostly J. "Kameez Shalwar") were stored in the jewelry catalog
 * because the non-jewelry name filter did not know those garment words.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJewelryProduct } from '../scripts/scrapers/parsers/jewelryParser.js';

const cfg = { brand: 'TestBrand', category: 'jewelry', source: 'test' };
const raw = (title) => ({
  title,
  price: 2500,
  images: ['https://example.com/a.jpg'],
  productUrl: `https://example.com/${encodeURIComponent(title)}`,
  description: '',
  tags: [],
});

const CLOTHING_NAMES = [
  'Golden Formal Kameez Shalwar With Waistcoat',
  'Teal Blue Semi-Formal Kameez Shalwar',
  'Navy Blue Casual Cotton Kameez Shalwar',
  'Khaddar Embroidered Shalwar',
  'RTW | SHALWAR',
  'Formal Waistcoat',
  'Linen Trousers',
];

const REAL_JEWELRY = [
  'Gold Sun Earrings',
  'Crystal Drops',
  'Ghozun Set',
  'Pearl Necklace Set',
  'Botanic Earrings',
  'Pink Tops Earrings', // "tops" are stud earrings, must not be treated as the garment
  'Kundan Jhumka',
  'Bridal Maang Tikka',
];

for (const name of CLOTHING_NAMES) {
  test(`rejects clothing: ${name}`, () => {
    assert.equal(normalizeJewelryProduct(raw(name), cfg), null);
  });
}

for (const name of REAL_JEWELRY) {
  test(`keeps jewelry: ${name}`, () => {
    const p = normalizeJewelryProduct(raw(name), cfg);
    assert.ok(p, `"${name}" was wrongly rejected`);
    assert.equal(p.name, name);
  });
}
