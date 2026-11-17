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

// ── feedback: API (backend) -> consumer (pipeline) ───────────────────────────
import { buildFeedbackEvent, feedbackEventId } from '../../backend/events/feedbackEvents.js';

test('feedback built by the API passes consumer validation and the ids agree', () => {
  const body = { action: 'save', clientEventId: 'evt-12345678', surface: 'product', productUrl: 'https://b.pk/p/1', catalog: 'shoes', query: 'black heels', position: 3 };
  const e = buildFeedbackEvent(body, 'u:abc');
  const r = validateEvent(e);
  assert.equal(r.ok, true, r.reason);
  assert.equal(e.eventId, pipelineId('user.feedback', e.payload));
  assert.equal(feedbackEventId(e.payload), pipelineId('user.feedback', e.payload));
});

test('feedback without a product (e.g. a thumbs-down on an agent answer) is still valid', () => {
  const e = buildFeedbackEvent({ action: 'thumb_down', clientEventId: 'evt-87654321', surface: 'agent', query: 'mehndi outfit' }, 'sess-xyz12345');
  assert.equal(validateEvent(e).ok, true);
});
