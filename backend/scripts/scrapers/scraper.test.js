import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShopifyAllProductsJsonUrl,
  buildShopifyCollectionProductsJsonUrl,
  inferColor,
  normalizeShopifyProduct
} from './scraper.js';

test('inferColor maps common colors', () => {
  assert.equal(inferColor('Red Silk Kurti'), 'Red');
  assert.equal(inferColor('NAVY blue dress'), 'Blue');
  assert.equal(inferColor('Emerald Green Suit'), 'Green');
  assert.equal(inferColor('Black Heels'), 'Black');
  assert.equal(inferColor('Ivory Pearl Earrings'), 'White');
});

test('buildShopifyCollectionProductsJsonUrl appends products.json + params', () => {
  const out = buildShopifyCollectionProductsJsonUrl('https://example.com/collections/pret', 25, 2);
  assert.equal(out, 'https://example.com/collections/pret/products.json?limit=25&page=2');
});

test('buildShopifyAllProductsJsonUrl targets /products.json + params', () => {
  const out = buildShopifyAllProductsJsonUrl('https://example.com/collections/pret', 10, 3);
  assert.equal(out, 'https://example.com/products.json?limit=10&page=3');
});

test('normalizeShopifyProduct returns a complete Product object', () => {
  const shopifyProduct = {
    title: 'Printed Cambric Stitched 2 Piece Suit',
    handle: 'printed-cambric-stitched-2-piece-suit',
    images: [{ src: '//cdn.example.com/img.jpg' }],
    variants: [{ price: '4990.00' }]
  };

  const normalized = normalizeShopifyProduct(
    shopifyProduct,
    'https://example.com',
    'TestBrand',
    'Dress',
    ['casual'],
    ['minimal']
  );

  assert.ok(normalized);
  assert.equal(normalized.brand, 'TestBrand');
  assert.equal(normalized.category, 'Dress');
  assert.equal(normalized.price, 4990);
  assert.equal(normalized.imageUrl, 'https://cdn.example.com/img.jpg');
  assert.equal(normalized.productUrl, 'https://example.com/products/printed-cambric-stitched-2-piece-suit');
  assert.ok(normalized.title.length > 0);
  assert.ok(normalized.color);
});

test('normalizeShopifyProduct rejects product when price is missing', () => {
  const shopifyProduct = {
    title: 'Printed Cambric Stitched 2 Piece Suit',
    handle: 'printed-cambric-stitched-2-piece-suit',
    images: [{ src: '//cdn.example.com/img.jpg' }],
    variants: [{}]
  };

  const normalized = normalizeShopifyProduct(
    shopifyProduct,
    'https://example.com',
    'TestBrand',
    'Dress',
    ['casual'],
    ['minimal']
  );

  assert.equal(normalized, null);
});
