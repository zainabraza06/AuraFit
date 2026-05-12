/**
 * Outfit planner helpers — taxonomy audit + footwear scoring (no DB).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lexicalTaxonomyAlignment, summarizeCatalogHealth } from '../services/catalogTaxonomyAudit.js';
import { footwearFashionScore, pickJewelrySet } from '../services/accessoryMatcher.js';
import { validateAccessoryPlan, stripAccessoryPlanForClient } from '../services/accessorySearchPlanner.js';
import { escapeRegex } from '../utils/regexEscape.js';
import { inferSearchCatalog } from '../services/intentAdapter.js';

describe('lexicalTaxonomyAlignment', () => {
  test('high score when title matches subCategory', () => {
    const { score, flags } = lexicalTaxonomyAlignment({
      name: 'Bridal 3 piece embroidered lehenga set',
      description: 'wedding wear',
      tags: ['bridal'],
      subCategory: '3-piece',
      dressStyle: 'lehenga'
    });
    assert.ok(score >= 0.5);
    assert.ok(flags.length <= 2);
  });
});

describe('summarizeCatalogHealth', () => {
  test('averages scores', () => {
    const h = summarizeCatalogHealth([
      { _id: '1', name: 'Red lawn kurta', subCategory: 'kurta', dressStyle: 'kurta', description: '', tags: [] }
    ]);
    assert.equal(h.perItem.length, 1);
    assert.ok(typeof h.avgLexicalAlignment === 'number');
  });
});

describe('validateAccessoryPlan', () => {
  test('filters unknown enums and dedupes', () => {
    const p = validateAccessoryPlan({
      shoeTypes: ['heel', 'NotAShoe', 'heel', 'Khussa'],
      jewelryTypes: ['jhumka', 'fake'],
      watchTypes: ['dress'],
      completionFocus: ['dupatta_eastern', 'none', 'bogus'],
      rationale: 'x'.repeat(600)
    });
    assert.deepEqual(p.shoeTypes, ['heel', 'khussa']);
    assert.deepEqual(p.jewelryTypes, ['jhumka']);
    assert.deepEqual(p.watchTypes, ['dress']);
    assert.deepEqual(p.completionFocus, ['dupatta_eastern', 'none']);
    assert.equal(p.rationale.length, 500);
  });

  test('fuzzy maps common plural typo to allowed enum', () => {
    const p = validateAccessoryPlan({
      shoeTypes: ['heels', 'khusa'],
      jewelryTypes: [],
      watchTypes: [],
      completionFocus: []
    });
    assert.ok(p.shoeTypes.includes('heel'));
    assert.ok(p.shoeTypes.includes('khussa'));
    assert.ok((p.planMeta?.fuzzyResolved?.shoes ?? 0) >= 1);
  });

  test('stripAccessoryPlanForClient removes planMeta', () => {
    const p = validateAccessoryPlan({ shoeTypes: ['flat'], jewelryTypes: [], watchTypes: [], completionFocus: [] });
    const pub = stripAccessoryPlanForClient(p);
    assert.equal(pub.planMeta, undefined);
    assert.deepEqual(pub.shoeTypes, ['flat']);
  });

  test('empty input yields empty arrays', () => {
    const p = validateAccessoryPlan(null);
    assert.deepEqual(p.shoeTypes, []);
    assert.deepEqual(p.completionFocus, []);
  });
});

describe('escapeRegex', () => {
  test('escapes metacharacters for fabric-like input', () => {
    const s = 'silk+cotton';
    const r = new RegExp(escapeRegex(s), 'i');
    assert.ok(r.test('Silk+Cotton'));
  });
});

describe('pickJewelrySet completionFocus', () => {
  const dress = { primaryColor: 'Maroon', colors: ['Maroon'], occasion: ['party'] };
  const pool = [
    { jewelryType: 'stud', primaryColor: 'Gold', colors: ['Gold'], occasion: ['party'] },
    { jewelryType: 'jhumka', primaryColor: 'Gold', colors: ['Gold'], occasion: ['party'] },
    { jewelryType: 'pendant-chain', primaryColor: 'Gold', colors: ['Gold'], occasion: ['party'] }
  ];

  test('statement_jewelry prefers heavier types when scores tie-ish', () => {
    const stmt = pickJewelrySet(dress, ['party'], pool, {
      maxItems: 6,
      completionFocus: ['statement_jewelry']
    });
    assert.equal(stmt[0].product.jewelryType, 'jhumka');
    assert.ok(stmt.length >= 2);
  });

  test('minimal_jewelry caps selection count', () => {
    const min = pickJewelrySet(dress, ['party'], pool, {
      maxItems: 6,
      completionFocus: ['minimal_jewelry']
    });
    assert.ok(min.length <= 2);
  });
});

describe('inferSearchCatalog', () => {
  test('uses LLM searchCatalog when valid', () => {
    assert.equal(inferSearchCatalog('anything', { searchCatalog: 'jewelry', color: 'Any' }), 'jewelry');
    assert.equal(inferSearchCatalog('x', { searchCatalog: 'jewellery', color: 'Any' }), 'jewelry');
  });

  test('infers shoes from message without garment words', () => {
    assert.equal(inferSearchCatalog('black heels for party under 8000', { color: 'Any' }), 'shoes');
  });

  test('stays clothing when garment mentioned', () => {
    assert.equal(inferSearchCatalog('red kurta with white sneakers', { color: 'Any' }), 'clothing');
  });

  test('infers jewelry', () => {
    assert.equal(inferSearchCatalog('gold jhumka for mehndi', { color: 'Any' }), 'jewelry');
  });

  test('infers watches', () => {
    assert.equal(inferSearchCatalog('minimal smartwatch for office', { color: 'Any' }), 'watches');
  });
});

describe('footwearFashionScore', () => {
  test('returns bounded score', () => {
    const s = footwearFashionScore(
      {
        primaryColor: 'Red',
        colors: ['Red'],
        occasion: ['party'],
        dressStyle: 'frock'
      },
      {
        primaryColor: 'Black',
        colors: ['Black'],
        occasion: ['party'],
        shoeType: 'heel'
      }
    );
    assert.ok(s > 0.2 && s <= 1);
  });
});
