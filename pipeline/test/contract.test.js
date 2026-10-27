import test from 'node:test';
import assert from 'node:assert/strict';
import { eventIdFor as pipelineId, validateEvent } from '../src/common/events.js';
import { buildEvent as scraperEvent, eventIdFor as scraperId, eventsForUpsert } from '../../backend/events/productEvents.js';

// The scraper (backend) and consumer (pipeline) are separate deployables with
// duplicated envelope code. This test is the contract that keeps them in sync.

const d = { productUrl: 'https://k.pk/p/1', brand: 'Khaadi', name: 'Suit', price: 100 };
const c = { productUrl: 'https://k.pk/p/1', brand: 'Khaadi', name: 'Suit', oldPrice: 150, newPrice: 100 };

test('event ids match across scraper and consumer', () => {
  assert.equal(scraperId('product.discovered', d), pipelineId('product.discovered', d));
  assert.equal(scraperId('product.price_changed', c), pipelineId('product.price_changed', c));
});

test('everything the scraper emits passes consumer validation', () => {
  const product = { ...d, images: ['https://i/a.jpg'], category: 'clothing', subCategory: '3-piece', compareAtPrice: 200 };
  const events = [
    ...eventsForUpsert({ outcome: 'inserted' }, product),
    ...eventsForUpsert({ outcome: 'updated', oldPrice: 150 }, product),
    scraperEvent('product.discovered', d),
  ];
  assert.equal(events.length, 3);
  for (const e of events) {
    const r = validateEvent(e);
    assert.equal(r.ok, true, r.reason);
  }
});
