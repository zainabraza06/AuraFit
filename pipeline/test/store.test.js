import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { models } from '../src/common/db.js';
import { createStore } from '../src/consumer/store.js';
import { buildEvent } from '../src/common/events.js';
import { EVENT_TYPES } from '../src/common/topics.js';

let mongod;
let store;
const URL = 'https://b.pk/p/1';
const at = (secs) => new Date(Date.UTC(2026, 0, 1, 0, 0, secs)).toISOString();

const discovered = (price, secs) => ({ ...buildEvent(EVENT_TYPES.DISCOVERED, { productUrl: URL, brand: 'K', name: 'Suit', price }), occurredAt: at(secs) });
const changed = (oldPrice, newPrice, secs) => ({ ...buildEvent(EVENT_TYPES.PRICE_CHANGED, { productUrl: URL, brand: 'K', name: 'Suit', oldPrice, newPrice }), occurredAt: at(secs) });
const state = () => models.ProductState.findOne({ productUrl: URL }).lean();

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([models.ProductState.init(), models.ProcessedEvent.init()]);
  store = createStore(models);
});
after(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => { await models.ProductState.deleteMany({}); await models.ProcessedEvent.deleteMany({}); });

test('in-order: discovered then price drop updates state and flags the drop', async () => {
  await store.save(discovered(1000, 1));
  const r = await store.save(changed(1000, 800, 2));
  assert.equal((await state()).price, 800);
  assert.equal(r.priceDrop.oldPrice, 1000);
});

test('out-of-order: a stale discovered event does not overwrite a newer price', async () => {
  const drop = await store.save(changed(1000, 800, 2)); // arrives first
  assert.equal(drop.priceDrop.newPrice, 800);           // oldPrice taken from the payload
  const late = await store.save(discovered(1000, 1));   // older event arrives late
  assert.equal(late.outcome, 'stored');
  assert.equal(late.priceDrop, undefined);
  assert.equal((await state()).price, 800);
});

test('replaying the same event is a duplicate and changes nothing', async () => {
  const e = discovered(1000, 1);
  assert.equal((await store.save(e)).outcome, 'stored');
  await store.complete(e.eventId);
  assert.equal((await store.save(e)).outcome, 'duplicate');
  assert.equal(await models.ProcessedEvent.countDocuments({}), 1);
});

test('price increase is stored but is not a drop', async () => {
  await store.save(discovered(1000, 1));
  const r = await store.save(changed(1000, 1200, 2));
  assert.equal(r.priceDrop, undefined);
  assert.equal((await state()).price, 1200);
});

test('crash after save but before complete: redelivery resumes and still reports the drop', async () => {
  await store.save(discovered(1000, 1));
  await store.complete(discovered(1000, 1).eventId);
  const e = changed(1000, 800, 2);

  const first = await store.save(e);   // consumer is killed here: complete() never runs
  assert.equal(first.priceDrop.newPrice, 800);

  const again = await store.save(e);   // redelivered after restart
  assert.equal(again.outcome, 'stored', 'a pending event must be resumed, not skipped as a duplicate');
  assert.equal(again.priceDrop.newPrice, 800, 'the drop decided the first time must survive the crash');
  assert.equal((await state()).price, 800);

  await store.complete(e.eventId);
  assert.equal((await store.save(e)).outcome, 'duplicate');
  assert.equal(await models.ProcessedEvent.countDocuments({ eventId: e.eventId }), 1);
});
