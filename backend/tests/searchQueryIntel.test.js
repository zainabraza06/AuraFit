/**
 * searchQueryIntel — query signals + facet hybrid helpers (no DB).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSearchQuery,
  buildSemanticQueryText,
  facetAlignmentScore,
  hybridSearchScore,
  semanticBlendWeight,
  similarityFloor
} from '../services/searchQueryIntel.js';

describe('analyzeSearchQuery', () => {
  test('does not treat "women" as men', () => {
    const s = analyzeSearchQuery('red dress for women party');
    assert.equal(s.genderHint, 'women');
  });

  test('extracts color + occasion from a very short query', () => {
    const s = analyzeSearchQuery('maroon wedding');
    assert.equal(s.hasExplicitColor, true);
    assert.ok(s.occasions.includes('wedding'));
    assert.ok(s.colorIntel.colors.includes('Red'));
  });

  test('marks strong constraints when both color and occasion present', () => {
    const s = analyzeSearchQuery('blue party');
    assert.equal(s.hasStrongConstraints, true);
  });
});

describe('buildSemanticQueryText', () => {
  test('includes structured lines for short queries', () => {
    const s = analyzeSearchQuery('green mehndi lehenga');
    const t = buildSemanticQueryText(s);
    assert.ok(t.includes('green mehndi lehenga'));
    assert.ok(t.includes('Occasion:'));
    assert.ok(t.includes('mehndi'));
    assert.ok(t.includes('Garment / silhouette:'));
    assert.ok(t.includes('lehenga'));
  });
});

describe('facetAlignmentScore', () => {
  test('rewards matching occasion and color', () => {
    const s = analyzeSearchQuery('red party');
    const hi = facetAlignmentScore(s, {
      name: 'Silk outfit',
      occasion: ['party'],
      primaryColor: 'Red',
      colors: ['Red'],
      tags: [],
      style: [],
      description: '',
      subCategory: 'pret',
      dressStyle: 'kurta',
      category: 'women'
    });
    assert.ok(hi > 0.75);
  });

  test('penalizes wrong color when user specified a family', () => {
    const s = analyzeSearchQuery('navy blue wedding');
    const lo = facetAlignmentScore(s, {
      name: 'Bridal',
      occasion: ['wedding'],
      primaryColor: 'Red',
      colors: [],
      tags: [],
      style: [],
      description: '',
      subCategory: 'bridal',
      dressStyle: 'lehenga',
      category: 'women'
    });
    assert.ok(lo < 0.72);
  });
});

describe('hybridSearchScore + floors', () => {
  test('short strong query uses more facet weight', () => {
    const wShort = semanticBlendWeight(12, true);
    const wLong = semanticBlendWeight(180, false);
    assert.ok(wShort < wLong);
  });

  test('combines cosine and facet', () => {
    const h = hybridSearchScore(0.5, 0.95, 10, true);
    assert.ok(h > 0.5);
    assert.ok(h <= 1);
  });

  test('lowers floor when color+occasion', () => {
    const strong = analyzeSearchQuery('pink party');
    const vague = analyzeSearchQuery('something nice');
    assert.ok(similarityFloor(strong) < similarityFloor(vague));
  });
});
