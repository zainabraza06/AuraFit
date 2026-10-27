import test from 'node:test';
import assert from 'node:assert/strict';
import { idempotent } from '../src/worker/idempotent.js';
import { createImageJob } from '../src/worker/imageJob.js';
import { createNotifyJob } from '../src/worker/notifyJob.js';
import { acquireLock } from '../src/common/lock.js';
import { fakeRedis } from './helpers.js';

test('idempotent runs a job once even if delivered twice', async () => {
  const r = fakeRedis();
  let runs = 0;
  const h = idempotent(r, 'jobs.image', async () => { runs++; });
  await h({ eventId: 'e1' });
  await h({ eventId: 'e1' });
  assert.equal(runs, 1);
});

test('idempotent throws (so RabbitMQ retries) when another worker holds the lock', async () => {
  const r = fakeRedis();
  await acquireLock(r, 'jobs.image:e2');
  const h = idempotent(r, 'jobs.image', async () => {});
  await assert.rejects(h({ eventId: 'e2' }), /locked/);
});

test('failed job is not marked done, so a retry runs it again', async () => {
  const r = fakeRedis();
  let n = 0;
  const h = idempotent(r, 'q', async () => { if (++n === 1) throw new Error('x'); });
  await assert.rejects(h({ eventId: 'e3' }));
  await h({ eventId: 'e3' });
  assert.equal(n, 2);
});

test('image job downloads, transforms, uploads and records', async () => {
  const rec = [];
  const run = createImageJob({
    fetchImage: async () => Buffer.from('raw'),
    transform: async (b) => Buffer.concat([b, Buffer.from('!')]),
    upload: async () => 'https://res.cloudinary.com/x.webp',
    recordResult: async (url, r) => rec.push([url, r]),
  });
  await run({ imageUrl: 'https://i/a.jpg', productUrl: 'p', eventId: 'e' });
  assert.deepEqual(rec, [['p', { hostedUrl: 'https://res.cloudinary.com/x.webp', bytes: 4 }]]);
});

test('image job still records when no uploader is configured', async () => {
  const rec = [];
  const run = createImageJob({
    fetchImage: async () => Buffer.from('raw'),
    transform: async (b) => b,
    upload: null,
    recordResult: async (u, r) => rec.push(r),
  });
  await run({ imageUrl: 'x', productUrl: 'p', eventId: 'e' });
  assert.equal(rec[0].hostedUrl, null);
});

test('notify job computes the percentage drop', async () => {
  const sent = [];
  const run = createNotifyJob({ deliver: async (n) => sent.push(n), logger: { info() {} } });
  await run({ productUrl: 'p', brand: 'Khaadi', name: 'Suit', oldPrice: 200, newPrice: 150, currency: 'PKR', eventId: 'e' });
  assert.equal(sent[0].pct, 25);
  assert.match(sent[0].message, /25%/);
});
