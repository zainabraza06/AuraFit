import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvent, validateEvent, eventIdFor } from '../src/common/events.js';
import { EVENT_TYPES } from '../src/common/topics.js';

const discovered = { productUrl: 'https://brand.pk/p/1', brand: 'Khaadi', name: 'Lawn Suit', price: 4500 };

test('buildEvent produces a valid discovered event', () => {
  const r = validateEvent(buildEvent(EVENT_TYPES.DISCOVERED, discovered));
  assert.equal(r.ok, true);
  assert.equal(r.event.payload.currency, 'PKR');
});

test('same fact yields the same eventId; different price does not', () => {
  const a = eventIdFor(EVENT_TYPES.DISCOVERED, discovered);
  assert.equal(a, eventIdFor(EVENT_TYPES.DISCOVERED, { ...discovered }));
  assert.notEqual(a, eventIdFor(EVENT_TYPES.DISCOVERED, { ...discovered, price: 4000 }));
});

test('rejects negative price', () => {
  const r = validateEvent(buildEvent(EVENT_TYPES.DISCOVERED, { ...discovered, price: -1 }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /payload/);
});

test('rejects unknown event type and non-objects', () => {
  assert.equal(validateEvent({ ...buildEvent(EVENT_TYPES.DISCOVERED, discovered), type: 'nope' }).ok, false);
  assert.equal(validateEvent('garbage').ok, false);
});

test('price_changed requires old and new price', () => {
  const bad = buildEvent(EVENT_TYPES.PRICE_CHANGED, { productUrl: discovered.productUrl, brand: 'K', name: 'x', newPrice: 1 });
  assert.equal(validateEvent(bad).ok, false);
});
