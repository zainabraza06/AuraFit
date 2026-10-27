import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../src/consumer/handler.js';
import { createDedupe } from '../src/common/dedupe.js';
import { buildEvent } from '../src/common/events.js';
import { EVENT_TYPES, QUEUES } from '../src/common/topics.js';
import { fakeRedis } from './helpers.js';

const counter = () => ({ calls: [], inc(l) { this.calls.push(l); } });

function setup({ saveImpl } = {}) {
  const dlq = [];
  const published = [];
  const events = counter();
  const seen = new Set();
  const store = {
    saves: 0,
    completed: [],
    complete: async function (id) { this.completed.push(id); },
    save: saveImpl || (async function (e) {
      this.saves++;
      if (seen.has(e.eventId)) return { outcome: 'duplicate' };
      seen.add(e.eventId);
      return { outcome: 'stored' };
    }),
  };
  const handle = createHandler({
    store,
    dedupe: createDedupe(fakeRedis(), 60),
    jobs: { publish: async (q, j) => published.push([q, j]) },
    sendToDlq: async (raw, reason) => dlq.push({ raw, reason }),
    metrics: { events, latency: { startTimer: () => () => {} } },
    logger: { warn() {}, info() {}, error() {}, debug() {} },
    backoffMs: 1,
  });
  return { handle, dlq, published, events, store };
}

const ev = (over = {}) => buildEvent(EVENT_TYPES.DISCOVERED, {
  productUrl: 'https://b.pk/p/1', brand: 'Khaadi', name: 'Suit', price: 100, ...over,
});

test('valid event is stored once', async () => {
  const t = setup();
  await t.handle(JSON.stringify(ev()));
  assert.deepEqual(t.events.calls, [{ type: EVENT_TYPES.DISCOVERED, outcome: 'stored' }]);
  assert.equal(t.dlq.length, 0);
});

test('redelivered event is dropped by the redis check without touching the store', async () => {
  const t = setup();
  const raw = JSON.stringify(ev());
  await t.handle(raw);
  await t.handle(raw);
  assert.equal(t.store.saves, 1);
  assert.equal(t.events.calls[1].outcome, 'duplicate');
});

test('malformed JSON and schema violations go to the DLQ with a reason', async () => {
  const t = setup();
  await t.handle('{not json');
  await t.handle(JSON.stringify(ev({ price: -5 })));
  assert.equal(t.dlq.length, 2);
  assert.match(t.dlq[0].reason, /malformed/);
  assert.match(t.dlq[1].reason, /payload/);
  assert.ok(t.events.calls.every((c) => c.outcome === 'invalid'));
});

test('transient store failure is retried and then succeeds', async () => {
  let n = 0;
  const t = setup({ saveImpl: async () => { if (++n < 3) throw new Error('mongo down'); return { outcome: 'stored' }; } });
  await t.handle(JSON.stringify(ev()));
  assert.equal(n, 3);
  assert.equal(t.dlq.length, 0);
  assert.equal(t.events.calls.at(-1).outcome, 'stored');
});

test('persistent store failure is dead-lettered after max retries', async () => {
  const t = setup({ saveImpl: async () => { throw new Error('mongo down'); } });
  await t.handle(JSON.stringify(ev()));
  assert.equal(t.dlq.length, 1);
  assert.match(t.dlq[0].reason, /after 3 attempts/);
  assert.equal(t.events.calls[0].outcome, 'dlq');
});

test('image and price-drop jobs are enqueued for stored events', async () => {
  const drop = { productUrl: 'https://b.pk/p/1', name: 'Suit', brand: 'Khaadi', oldPrice: 200, newPrice: 100, currency: 'PKR' };
  const t = setup({ saveImpl: async () => ({ outcome: 'stored', priceDrop: drop }) });
  await t.handle(JSON.stringify(ev({ imageUrl: 'https://cdn.b.pk/a.jpg' })));
  assert.deepEqual(t.published.map(([q]) => q), [QUEUES.image, QUEUES.notify]);
});

test('event is only completed after its jobs were enqueued; a failed enqueue is retried, not lost', async () => {
  let publishes = 0;
  const store = {
    completed: [],
    async complete(id) { this.completed.push(id); },
    async save() { return { outcome: 'stored', priceDrop: { productUrl: 'u', name: 'n', brand: 'b', oldPrice: 2, newPrice: 1, currency: 'PKR' } }; },
  };
  const handle = createHandler({
    store,
    dedupe: createDedupe(fakeRedis(), 60),
    jobs: { publish: async () => { if (++publishes === 1) throw new Error('rabbit down'); } },
    sendToDlq: async () => {},
    metrics: { events: counter(), latency: { startTimer: () => () => {} } },
    logger: { warn() {}, info() {}, error() {}, debug() {} },
    backoffMs: 1,
  });
  const e = ev();
  await handle(JSON.stringify(e));
  assert.equal(publishes, 2); // first attempt failed, second succeeded
  assert.deepEqual(store.completed, [e.eventId]); // completed exactly once, after the jobs went out
});
