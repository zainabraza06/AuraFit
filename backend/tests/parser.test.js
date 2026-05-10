/**
 * parser.test.js
 * Unit tests for productParser — occasion mapping, gender, pieces, fabric.
 * No DB or network required.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProduct, validateProduct } from '../scripts/scrapers/parsers/productParser.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeRaw(overrides = {}) {
  return {
    title: 'Test Product',
    price: 3000,
    images: ['https://example.com/img.jpg'],
    productUrl: 'https://example.com/product',
    description: '',
    tags: [],
    ...overrides
  };
}

function makeConfig(overrides = {}) {
  return {
    brand: 'TestBrand',
    category: 'clothing',
    subCategory: '3-piece',
    occasion: [],
    style: [],
    source: 'test',
    ...overrides
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// OCCASION MAPPING — eid/festive/fashion → party (fancy category rule)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Occasion mapping — eid/festive → also party wear', () => {

  test('"eid" in title → occasions include both eid AND party', () => {
    const p = normalizeProduct(makeRaw({ title: 'Eid Special 3-Piece Suit' }), makeConfig());
    assert(p.occasion.includes('eid'),   'should have eid');
    assert(p.occasion.includes('party'), 'eid product must also be party wear');
  });

  test('"festive" in title → occasions include party', () => {
    const p = normalizeProduct(makeRaw({ title: 'Festive Collection Embroidered Suit' }), makeConfig());
    assert(p.occasion.includes('party'), 'festive product must also be party wear');
  });

  test('"celebration" in tags → occasions include party', () => {
    const p = normalizeProduct(makeRaw({ title: 'Designer Suit', tags: ['celebration', 'festive'] }), makeConfig());
    assert(p.occasion.includes('party'), 'celebration product must be party wear');
  });

  test('"luxury" in description → occasions include party', () => {
    const p = normalizeProduct(
      makeRaw({ title: 'Designer Suit', description: 'Luxury silk embroidered suit' }),
      makeConfig()
    );
    assert(p.occasion.includes('party'), 'luxury product must be party wear');
  });

  test('"mehndi" in title → occasions include mehndi AND party', () => {
    const p = normalizeProduct(makeRaw({ title: 'Mehndi Night Outfit' }), makeConfig());
    assert(p.occasion.includes('mehndi'), 'should have mehndi');
    assert(p.occasion.includes('party'),  'mehndi occasion must also be party wear');
  });

  test('"wedding" and "bridal" in title → occasion includes wedding', () => {
    const p = normalizeProduct(makeRaw({ title: 'Bridal Wedding Lehenga Set' }), makeConfig({ subCategory: 'festive' }));
    assert(p.occasion.includes('wedding'), 'bridal product should have wedding occasion');
  });

  test('config-level occasions are preserved', () => {
    const p = normalizeProduct(
      makeRaw({ title: 'Basic Pret Suit' }),
      makeConfig({ occasion: ['casual', 'office'], subCategory: 'kurta' })
    );
    assert(p.occasion.includes('casual'), 'config occasion: casual should be preserved');
    assert(p.occasion.includes('office'), 'config occasion: office should be preserved');
  });

  test('no duplicate occasions (deduplicated)', () => {
    const p = normalizeProduct(
      makeRaw({ title: 'Eid Party Dress', tags: ['eid', 'party'] }),
      makeConfig({ occasion: ['party'] })
    );
    const partyCount = p.occasion.filter(o => o === 'party').length;
    assert.equal(partyCount, 1, 'party should not appear more than once');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GENDER INFERENCE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Gender inference', () => {

  test('default gender is "women" when no keyword', () => {
    const p = normalizeProduct(makeRaw({ title: 'Embroidered Suit' }), makeConfig());
    assert.equal(p.gender, 'women');
  });

  test('"men" keyword → gender = men', () => {
    const p = normalizeProduct(makeRaw({ title: 'Men Kurta Shalwar Set' }), makeConfig());
    assert.equal(p.gender, 'men');
  });

  test('"gents" keyword → gender = men', () => {
    const p = normalizeProduct(makeRaw({ title: 'Gents Shalwar Kameez' }), makeConfig());
    assert.equal(p.gender, 'men');
  });

  test('"kids" keyword → gender = kids', () => {
    const p = normalizeProduct(makeRaw({ title: 'Kids Party Dress' }), makeConfig());
    assert.equal(p.gender, 'kids');
  });

  test('"children" in description → gender = kids', () => {
    const p = normalizeProduct(
      makeRaw({ title: 'Festive Outfit', description: 'For children aged 5-10' }),
      makeConfig()
    );
    assert.equal(p.gender, 'kids');
  });

  test('"unisex" keyword → gender = unisex', () => {
    const p = normalizeProduct(makeRaw({ title: 'Unisex Cotton Kameez' }), makeConfig());
    assert.equal(p.gender, 'unisex');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIECES COUNT (derived from subCategory)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Pieces count inference', () => {

  const cases = [
    ['3-piece',             3],
    ['unstitched-3-piece',  3],
    ['2-piece',             2],
    ['unstitched-2-piece',  2],
    ['kurta',               1],
    ['pants',               1],
    ['shalwar',             1],
    ['dupatta',             1],
    ['western',             1],
    ['festive',             3],
    ['bridal',              3],
    ['other',               undefined]
  ];

  for (const [sub, expected] of cases) {
    test(`subCategory "${sub}" → pieces = ${expected}`, () => {
      const p = normalizeProduct(makeRaw(), makeConfig({ subCategory: sub }));
      assert.equal(p.pieces, expected);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FABRIC INFERENCE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Fabric inference from product text', () => {

  const fabricCases = [
    ['Pure Lawn Summer Suit', 'Lawn'],
    ['Chiffon Party Dress', 'Chiffon'],
    ['Georgette Formal Wear', 'Georgette'],
    ['Cotton Casual Kurta', 'Cotton'],
    ['Silk Bridal Lehenga', 'Silk'],
    ['Velvet Winter Suit', 'Velvet'],
    ['Khaddar Winter Collection', 'Khaddar'],
    ['Karandi Unstitched', 'Karandi'],
    ['Organza Formal Dress', 'Organza'],
    ['Banarsi Bridal Set', 'Banarsi'],
    ['Jacquard Festive Suit', 'Jacquard'],
  ];

  for (const [title, expectedFabric] of fabricCases) {
    test(`"${title}" → fabric = ${expectedFabric}`, () => {
      const p = normalizeProduct(makeRaw({ title }), makeConfig());
      assert.equal(p.fabric, expectedFabric, `expected fabric ${expectedFabric} from title "${title}"`);
    });
  }

  test('no fabric keyword → fabric is undefined', () => {
    const p = normalizeProduct(makeRaw({ title: 'Beautiful Party Suit' }), makeConfig());
    assert.equal(p.fabric, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCATEGORY — bridal keyword mapping
// ═══════════════════════════════════════════════════════════════════════════════
describe('SubCategory inference — bridal override', () => {

  test('"bridal collection" in title → subCategory = bridal (overrides "other")', () => {
    const p = normalizeProduct(makeRaw({ title: 'Bridal Collection Dress' }), makeConfig({ subCategory: 'other' }));
    assert.equal(p.subCategory, 'bridal');
  });

  test('"bridal couture" overrides default', () => {
    const p = normalizeProduct(makeRaw({ title: 'Bridal Couture 2025' }), makeConfig({ subCategory: 'other' }));
    assert.equal(p.subCategory, 'bridal');
  });

  test('config subCategory takes priority over keyword when not "other"', () => {
    const p = normalizeProduct(makeRaw({ title: 'Bridal Collection Dress' }), makeConfig({ subCategory: 'festive' }));
    // Config says "festive", even though title has "bridal" — config wins
    assert.equal(p.subCategory, 'festive');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Product validation', () => {

  test('valid product passes validation', () => {
    const p = normalizeProduct(makeRaw(), makeConfig());
    const result = validateProduct(p);
    assert.equal(result.valid, true);
  });

  test('missing name → normalizeProduct returns null', () => {
    const p = normalizeProduct(makeRaw({ title: '' }), makeConfig());
    assert.equal(p, null, 'empty title should return null');
  });

  test('zero price → normalizeProduct returns null', () => {
    const p = normalizeProduct(makeRaw({ price: 0 }), makeConfig());
    assert.equal(p, null, 'zero price should return null');
  });

  test('no images → normalizeProduct returns null', () => {
    const p = normalizeProduct(makeRaw({ images: [] }), makeConfig());
    assert.equal(p, null, 'no images should return null');
  });

  test('non-clothing product (bedsheet) → normalizeProduct returns null', () => {
    const p = normalizeProduct(makeRaw({ title: 'Cotton Bedsheet Set' }), makeConfig());
    assert.equal(p, null, 'bedsheet should be filtered out');
  });

  test('description is stored (up to 2000 chars)', () => {
    const longDesc = 'A'.repeat(3000);
    const p = normalizeProduct(makeRaw({ description: longDesc }), makeConfig());
    assert(p !== null);
    assert(p.description.length <= 2000, 'description should be capped at 2000 chars');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE INFERENCE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Style inference', () => {

  test('"embroidered" → style includes embroidered', () => {
    const p = normalizeProduct(makeRaw({ title: 'Embroidered Formal Suit' }), makeConfig({ style: [] }));
    assert(p.style.includes('embroidered'));
  });

  test('"bridal" → style includes heavy', () => {
    const p = normalizeProduct(makeRaw({ title: 'Bridal Handwork Lehenga' }), makeConfig({ style: [] }));
    assert(p.style.includes('heavy'));
  });

  test('"luxury" → style includes elegant', () => {
    const p = normalizeProduct(makeRaw({ title: 'Luxury Pret Collection' }), makeConfig({ style: [] }));
    assert(p.style.includes('elegant'));
  });

  test('config-level styles are merged with inferred styles', () => {
    const p = normalizeProduct(
      makeRaw({ title: 'Embroidered Elegant Suit' }),
      makeConfig({ style: ['traditional'] })
    );
    assert(p.style.includes('traditional'), 'config style should be kept');
    assert(p.style.includes('embroidered'), 'inferred style should be added');
  });
});
