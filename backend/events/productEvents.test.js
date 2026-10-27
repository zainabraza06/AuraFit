import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsForUpsert, createEventEmitter, EVENT_TYPES } from './productEvents.js';

const product = { productUrl: 'https://k.pk/p/1', brand: 'Khaadi', name: 'Suit', price: 100, images: ['https://i/a.jpg'] };

test('inserted product becomes a discovered event with its image', () => {
  const [e] = eventsForUpsert({ outcome: 'inserted' }, product);
  assert.equal(e.type, EVENT_TYPES.DISCOVERED);
  assert.equal(e.payload.imageUrl, 'https://i/a.jpg');
  assert.equal(e.payload.currency, 'PKR');
});

test('price change emits price_changed; other updates and unchanged emit nothing', () => {
  const [e] = eventsForUpsert({ outcome: 'updated', oldPrice: 150 }, product);
  assert.equal(e.type, EVENT_TYPES.PRICE_CHANGED);
  assert.deepEqual([e.payload.oldPrice, e.payload.newPrice], [150, 100]);
  assert.equal(eventsForUpsert({ outcome: 'updated', oldPrice: 100 }, product).length, 0);
  assert.equal(eventsForUpsert({ outcome: 'unchanged' }, product).length, 0);
});

test('emitter batches, flushes on close, and is inert when disabled', async () => {
  const sent = [];
  const pub = { publish: async (b) => sent.push(b.length), disconnect: async () => {} };
  const em = createEventEmitter({ enabled: true, publisherFactory: async () => pub, batchSize: 2 });
  for (let i = 0; i < 3; i++) await em.record({ outcome: 'inserted' }, { ...product, productUrl: `https://k.pk/p/${i}` });
  assert.deepEqual(sent, [2]);
  assert.equal(await em.close(), 3);

  const off = createEventEmitter({ enabled: false, publisherFactory: async () => { throw new Error('never'); } });
  await off.record({ outcome: 'inserted' }, product);
  assert.equal(await off.close(), 0);
});

test('publish failure is swallowed so the scrape continues', async () => {
  const em = createEventEmitter({
    enabled: true, logger: { warn() {} },
    publisherFactory: async () => ({ publish: async () => { throw new Error('broker down'); } }),
  });
  await em.record({ outcome: 'inserted' }, product);
  await assert.doesNotReject(em.flush());
});
