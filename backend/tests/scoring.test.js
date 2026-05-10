/**
 * scoring.test.js
 * Unit tests for recommendation scoring logic.
 * Pure functions only — no DB or network calls.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Load modules ─────────────────────────────────────────────────────────────
// These imports trigger module-level side-effects (HF SDK init, mongoose model
// definition) but do NOT open any network connection — safe for unit testing.
import {
  scoreProductAgainstIntent,
  textualMatchScore,
  normalizeColor,
  CANONICAL_COLORS
} from '../services/recommendationEngine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeProduct(overrides = {}) {
  return {
    _id: 'test-id',
    name: 'Test Dress',
    description: '',
    brand: 'TestBrand',
    primaryColor: 'Red',
    colors: ['Red'],
    subCategory: '3-piece',
    style: ['elegant'],
    occasion: ['party'],
    fabric: 'chiffon',
    price: 3000,
    tags: [],
    embedding: [],
    ...overrides
  };
}

function makeIntent(overrides = {}) {
  return {
    color: 'Any', shade: null,
    occasion: [], style: [],
    piece: null, fabric: null, stitching: null,
    maxBudget: 0, intentSummary: '',
    ...overrides
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR SCORING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Color scoring — five-tier system', () => {

  test('Tier 1 (1.0): exact primary color raw match', () => {
    const p = makeProduct({ primaryColor: 'Red', colors: ['Red'] });
    const s = scoreProductAgainstIntent(p, makeIntent({ color: 'Red', shade: 'red' }));
    assert.equal(s.colorMatch, 1.0);
  });

  test('Tier 1 (1.0): exact shade raw match (user says maroon, product is Maroon)', () => {
    const p = makeProduct({ primaryColor: 'Maroon', colors: ['Maroon'] });
    const s = scoreProductAgainstIntent(p, makeIntent({ color: 'Red', shade: 'maroon' }));
    assert.equal(s.colorMatch, 1.0);
  });

  test('Tier 2 (0.93): shade matches secondary color', () => {
    const p = makeProduct({ primaryColor: 'Black', colors: ['Black', 'Maroon'] });
    const s = scoreProductAgainstIntent(p, makeIntent({ color: 'Red', shade: 'maroon' }));
    assert.equal(s.colorMatch, 0.93);
  });

  test('Tier 3 (0.85): canonical alias match on primary (user navy → product Blue)', () => {
    const p = makeProduct({ primaryColor: 'Blue', colors: ['Blue'] });
    // shade="navy", color="Blue"; product stores canonical "Blue"
    const s = scoreProductAgainstIntent(p, makeIntent({ color: 'Blue', shade: 'navy' }));
    assert.equal(s.colorMatch, 0.85);
  });

  test('Tier 4 (0.78): canonical alias match on secondary color', () => {
    const p = makeProduct({ primaryColor: 'Black', colors: ['Black', 'Blue'] });
    const s = scoreProductAgainstIntent(p, makeIntent({ color: 'Blue', shade: 'navy' }));
    assert.equal(s.colorMatch, 0.78);
  });

  test('Tier 5 (0.08): completely wrong color family', () => {
    const p = makeProduct({ primaryColor: 'Red', colors: ['Red'] });
    const s = scoreProductAgainstIntent(p, makeIntent({ color: 'Blue', shade: 'blue' }));
    assert.equal(s.colorMatch, 0.08);
  });

  test('No color specified (Any) → neutral 0.4', () => {
    const p = makeProduct({ primaryColor: 'Red', colors: ['Red'] });
    const s = scoreProductAgainstIntent(p, makeIntent({ color: 'Any' }));
    assert.equal(s.colorMatch, 0.4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR ALIAS RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════
describe('normalizeColor — alias resolution', () => {
  const aliases = {
    'maroon': 'Red', 'mehroon': 'Red', 'laal': 'Red', 'burgundy': 'Red',
    'navy': 'Blue', 'cobalt': 'Blue', 'nila': 'Blue',
    'ferozi': 'Teal', 'firozi': 'Teal', 'turquoise': 'Teal',
    'pista': 'Green', 'mehendi': 'Green', 'sabz': 'Green',
    'gulabi': 'Pink', 'hot pink': 'Pink',
    'jamuni': 'Purple', 'baingan': 'Purple', 'lavender': 'Purple',
    'ivory': 'White', 'cream': 'White', 'safed': 'White',
    'golden': 'Gold', 'bronze': 'Gold',
    'mustard': 'Yellow', 'saffron': 'Yellow', 'zard': 'Yellow',
    'charcoal': 'Black', 'graphite': 'Black',
    'silver': 'Grey', 'ash': 'Grey'
  };

  for (const [alias, expected] of Object.entries(aliases)) {
    test(`"${alias}" resolves to ${expected}`, () => {
      assert.equal(normalizeColor(alias), expected);
    });
  }

  test('canonical color returns itself', () => {
    for (const c of CANONICAL_COLORS) {
      assert.equal(normalizeColor(c), c, `${c} should normalise to itself`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE SCORING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Price scoring — soft budget', () => {
  const base = makeIntent({ color: 'Any', maxBudget: 5000 });

  test('within budget → priceMatch = 1.0', () => {
    const s = scoreProductAgainstIntent(makeProduct({ price: 3000 }), base);
    assert.equal(s.priceMatch, 1.0);
  });

  test('exactly at budget → priceMatch = 1.0', () => {
    const s = scoreProductAgainstIntent(makeProduct({ price: 5000 }), base);
    assert.equal(s.priceMatch, 1.0);
  });

  test('10% over budget (5500 vs 5000) → priceMatch = 0.8', () => {
    const s = scoreProductAgainstIntent(makeProduct({ price: 5500 }), base);
    // overRatio = 500/5000 = 0.1 → score = max(0, 1 - 0.1*2) = 0.8
    assert.equal(s.priceMatch, 0.8);
  });

  test('50% over budget (7500 vs 5000) → priceMatch = 0', () => {
    const s = scoreProductAgainstIntent(makeProduct({ price: 7500 }), base);
    // overRatio = 2500/5000 = 0.5 → score = max(0, 1 - 0.5*2) = 0
    assert.equal(s.priceMatch, 0);
  });

  test('far over budget → priceMatch clamped to 0', () => {
    const s = scoreProductAgainstIntent(makeProduct({ price: 20000 }), base);
    assert.equal(s.priceMatch, 0);
  });

  test('no budget specified → priceMatch = null (factor excluded)', () => {
    const s = scoreProductAgainstIntent(makeProduct({ price: 5000 }), makeIntent({ maxBudget: 0 }));
    assert.equal(s.priceMatch, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEMANTIC — TEXTUAL MATCH SCORE (embedding fallback)
// ═══════════════════════════════════════════════════════════════════════════════
describe('textualMatchScore — semantic fallback', () => {

  test('product matching query words scores higher than unrelated product', () => {
    const bridal = makeProduct({
      name: 'Heavy Bridal Lehenga',
      description: 'Embroidered bridal dress for wedding ceremonies with heavy handwork',
      tags: ['bridal', 'wedding', 'heavy'],
      style: ['heavy', 'embroidered'],
      occasion: ['wedding']
    });
    const casual = makeProduct({
      name: 'Basic Casual Kurti',
      description: 'Simple everyday cotton kurta for office wear',
      tags: ['casual', 'basic'],
      style: ['minimal'],
      occasion: ['casual']
    });
    const query = 'heavy embroidered bridal dress for wedding';
    const bridalScore = textualMatchScore(bridal, query);
    const casualScore = textualMatchScore(casual, query);
    assert(bridalScore > casualScore,
      `bridal (${bridalScore.toFixed(3)}) should beat casual (${casualScore.toFixed(3)})`);
  });

  test('empty query returns neutral 0.3', () => {
    assert.equal(textualMatchScore(makeProduct(), ''), 0.3);
    assert.equal(textualMatchScore(makeProduct(), null), 0.3);
  });

  test('score is between 0 and 1', () => {
    const s = textualMatchScore(makeProduct({ name: 'Red Party Dress', description: 'Party wear' }), 'red party dress');
    assert(s >= 0 && s <= 1, `score ${s} must be 0-1`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEMANTIC EMBEDDING SCORING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Semantic embedding scoring (cosine similarity)', () => {

  test('same embedding = score 1.0 (semantic 100% match)', () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const p = makeProduct({ embedding, primaryColor: 'Any', colors: [] });
    const intent = makeIntent({ color: 'Any', intentSummary: 'test' });
    const s = scoreProductAgainstIntent(p, intent, embedding);
    // cos sim of identical vectors = 1.0; semanticMatch should be 1.0
    assert.equal(s.semanticMatch, 1.0);
  });

  test('orthogonal embedding = score 0 (no semantic overlap)', () => {
    const qEmb = [1, 0, 0];
    const pEmb = [0, 1, 0];
    const p = makeProduct({ embedding: pEmb });
    const s = scoreProductAgainstIntent(p, makeIntent(), qEmb);
    assert.equal(s.semanticMatch, 0);
  });

  test('no product embedding → falls back to textual score (not null)', () => {
    const p = makeProduct({ embedding: [], name: 'Bridal Dress', description: 'For wedding' });
    const intent = makeIntent({ intentSummary: 'bridal wedding dress' });
    const s = scoreProductAgainstIntent(p, intent, [0.1, 0.2]);
    // embedding length mismatch → falls back to textualMatchScore
    assert.notEqual(s.semanticMatch, null);
    assert(s.semanticMatch > 0);
  });

  test('total score is higher with matching embedding than mismatching', () => {
    const qEmb = [1, 0, 0];
    const matchEmb  = [0.9, 0.1, 0];   // similar to query
    const noMatchEmb = [0, 0, 1];       // orthogonal to query
    const intent = makeIntent({ color: 'Any' });

    const matchScore   = scoreProductAgainstIntent(makeProduct({ embedding: matchEmb  }), intent, qEmb);
    const noMatchScore = scoreProductAgainstIntent(makeProduct({ embedding: noMatchEmb }), intent, qEmb);
    assert(matchScore.total > noMatchScore.total,
      `match (${matchScore.total}) should beat no-match (${noMatchScore.total})`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OCCASION & STYLE SCORING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Occasion and style scoring', () => {

  test('matching occasion boosts score over non-matching', () => {
    const weddingProduct = makeProduct({ occasion: ['wedding', 'party'], subCategory: 'festive' });
    const casualProduct  = makeProduct({ occasion: ['casual', 'office'], subCategory: 'kurta'  });
    const intent = makeIntent({ occasion: ['wedding'], style: ['elegant'] });

    const ws = scoreProductAgainstIntent(weddingProduct, intent);
    const cs = scoreProductAgainstIntent(casualProduct,  intent);
    assert(ws.total > cs.total,
      `wedding product (${ws.total}) should rank above casual (${cs.total})`);
  });

  test('bridal query should not favour casual tops', () => {
    const bridalDress = makeProduct({ subCategory: 'bridal', occasion: ['wedding'], style: ['heavy', 'embroidered'] });
    const casualTop   = makeProduct({ subCategory: 'kurta',  occasion: ['casual'],  style: ['minimal'] });
    const intent = makeIntent({
      color: 'Any', occasion: ['wedding', 'bridal'],
      style: ['heavy', 'embroidered'], dressType: 'bridal'
    });
    const bs = scoreProductAgainstIntent(bridalDress, intent);
    const cs = scoreProductAgainstIntent(casualTop,   intent);
    assert(bs.total > cs.total,
      `bridal dress (${bs.total}) should outrank casual top (${cs.total})`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-CATEGORY (PIECE) SCORING
// ═══════════════════════════════════════════════════════════════════════════════
describe('Piece / subCategory scoring', () => {

  test('exact match "3-piece" = 1.0', () => {
    const p = makeProduct({ subCategory: '3-piece' });
    const s = scoreProductAgainstIntent(p, makeIntent({ piece: '3-piece' }));
    assert.equal(s.pieceMatch, 1.0);
  });

  test('unstitched intent only matches unstitched products strongly', () => {
    const stitched   = makeProduct({ subCategory: '3-piece' });
    const unstitched = makeProduct({ subCategory: 'unstitched-3-piece' });
    const intent = makeIntent({ piece: 'unstitched 3-piece' });

    const ss = scoreProductAgainstIntent(stitched,   intent);
    const us = scoreProductAgainstIntent(unstitched, intent);
    assert(us.pieceMatch > ss.pieceMatch,
      `unstitched (${us.pieceMatch}) should beat stitched (${ss.pieceMatch})`);
  });

  test('no piece in query → pieceMatch = null', () => {
    const s = scoreProductAgainstIntent(makeProduct(), makeIntent({ piece: null }));
    assert.equal(s.pieceMatch, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR FILTERING INTEGRATION (pure logic, no DB)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Color filtering logic', () => {

  test('wrong-color products score 0.08 and should be excluded from results', () => {
    const redProduct  = makeProduct({ primaryColor: 'Red',  colors: ['Red']  });
    const blueProduct = makeProduct({ primaryColor: 'Blue', colors: ['Blue'] });
    const intent = makeIntent({ color: 'Red', shade: 'red' });

    const rs = scoreProductAgainstIntent(redProduct,  intent);
    const bs = scoreProductAgainstIntent(blueProduct, intent);

    assert.equal(rs.colorMatch, 1.0, 'Red product should have colorMatch 1.0');
    assert.equal(bs.colorMatch, 0.08, 'Blue product should have colorMatch 0.08');

    // Simulate the filter that getOutfitForQuery applies
    const scored = [
      { product: redProduct,  scores: rs },
      { product: blueProduct, scores: bs }
    ];
    const colorMatches = scored.filter(s => s.scores.colorMatch > 0.08);
    assert.equal(colorMatches.length, 1, 'Only 1 correct-color product should pass filter');
    assert.equal(colorMatches[0].product.primaryColor, 'Red');
  });

  test('alias match (maroon→Red) passes the 0.08 filter', () => {
    const product = makeProduct({ primaryColor: 'Red', colors: ['Red'] });
    const intent  = makeIntent({ color: 'Red', shade: 'maroon' });
    const s = scoreProductAgainstIntent(product, intent);
    // Tier 3: canonical match → 0.85 → should pass the > 0.08 filter
    assert(s.colorMatch > 0.08, `alias match (${s.colorMatch}) should pass the color filter`);
  });
});
