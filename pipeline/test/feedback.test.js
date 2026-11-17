import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { models } from '../src/common/db.js';
import { createStore } from '../src/consumer/store.js';
import { createHandler } from '../src/consumer/handler.js';
import { createDedupe } from '../src/common/dedupe.js';
import { buildEvent, validateEvent, eventIdFor, partitionKey } from '../src/common/events.js';
import { EVENT_TYPES, TOPICS } from '../src/common/topics.js';
import { fakeRedis } from './helpers.js';

const payload = (over = {}) => ({ action: 'result_click', clientEventId: 'c-12345678', actor: 'a'.repeat(24), surface: 'search', productUrl: 'https://b.pk/p/1', catalog: 'clothing', query: 'red lehnga', position: 2, ...over });
const fb = (over) => buildEvent(EVENT_TYPES.FEEDBACK, payload(over), 'api');

test('feedback has its own topic and a valid envelope', () => {
  assert.equal(TOPICS.feedback, 'user.feedback');
  assert.equal(validateEvent(fb()).ok, true);
});

test('invalid feedback is rejected with a reason (unknown action, missing actor, bad catalog)', () => {
  for (const bad of [{ action: 'explode' }, { actor: undefined }, { catalog: 'cars' }, { position: -1 }, { query: 'x'.repeat(201) }]) {
    assert.equal(validateEvent(fb(bad)).ok, false, JSON.stringify(bad));
  }
});

test('event id is the same for a retried POST (same actor + clientEventId) and differs per actor', () => {
  assert.equal(eventIdFor(EVENT_TYPES.FEEDBACK, payload()), eventIdFor(EVENT_TYPES.FEEDBACK, payload({ query: 'different text' })));
  assert.notEqual(eventIdFor(EVENT_TYPES.FEEDBACK, payload()), eventIdFor(EVENT_TYPES.FEEDBACK, payload({ actor: 'b'.repeat(24) })));
});

test('partition key falls back to the actor when there is no product (keeps one shopper ordered)', () => {
  assert.equal(partitionKey(fb()), 'https://b.pk/p/1');
  assert.equal(partitionKey(fb({ productUrl: undefined })), 'a'.repeat(24));
});

let mongod;
let store;
before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await models.Feedback.init();
  store = createStore(models);
});
after(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => { await models.Feedback.deleteMany({}); });

test('store: a redelivered feedback event is stored exactly once', async () => {
  const e = fb();
  assert.equal((await store.saveFeedback(e)).outcome, 'stored');
  assert.equal((await store.saveFeedback(e)).outcome, 'duplicate');
  assert.equal(await models.Feedback.countDocuments(), 1);
  const row = await models.Feedback.findOne().lean();
  assert.equal(row.action, 'result_click');
  assert.equal(row.query, 'red lehnga');
  assert.equal(row.position, 2);
});

test('handler: feedback goes to the feedback store, creates no jobs, and bad feedback is dead-lettered', async () => {
  const dlq = [];
  const jobs = [];
  const counts = [];
  const handle = createHandler({
    store,
    dedupe: createDedupe(fakeRedis(), 60),
    jobs: { publish: async (q, j) => jobs.push([q, j]) },
    sendToDlq: async (raw, reason) => dlq.push(reason),
    metrics: { events: { inc: (l) => counts.push(l) }, latency: { startTimer: () => () => {} } },
    logger: { warn() {}, info() {}, error() {}, debug() {} },
    backoffMs: 1,
  });
  const e = fb();
  await handle(JSON.stringify(e));
  await handle(JSON.stringify(e)); // redelivery: dropped by dedupe
  await handle(JSON.stringify(fb({ action: 'explode' })));
  assert.equal(await models.Feedback.countDocuments(), 1);
  assert.deepEqual(jobs, [], 'feedback must not enqueue image/notification jobs');
  assert.equal(dlq.length, 1);
  assert.deepEqual(counts.filter((c) => c.outcome === 'stored'), [{ type: EVENT_TYPES.FEEDBACK, outcome: 'stored' }]);
});
