import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { sniffImageType, verifyImages, uploadErrorHandler, imageUpload } from '../middleware/uploads.js';
import { quota, callerKey, _resetQuotaMemory } from '../middleware/quota.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

test('sniffImageType recognises real images and rejects everything else', () => {
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(JPG), 'image/jpeg');
  assert.equal(sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)])), 'image/webp');
  assert.equal(sniffImageType(HTML), null);
  assert.equal(sniffImageType(Buffer.alloc(3)), null);
  assert.equal(sniffImageType('not a buffer'), null);
});

test('verifyImages rejects a spoofed upload and corrects the mimetype of a real one', () => {
  const ok = { file: { buffer: PNG, mimetype: 'image/jpeg', originalname: 'a.jpg' } };
  verifyImages(ok, {}, (err) => assert.equal(err, undefined));
  assert.equal(ok.file.mimetype, 'image/png');

  const bad = { files: { person: [{ buffer: HTML, mimetype: 'image/jpeg', originalname: 'x.jpg' }] } };
  let got;
  verifyImages(bad, {}, (err) => { got = err; });
  assert.equal(got.status, 400);
  assert.match(got.message, /not a valid image/);
});

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('upload route end to end: valid image passes, wrong declared type and fake image are 400, oversize is 413', async () => {
  const app = express();
  app.post('/up', imageUpload({ maxBytes: 1024 }).single('image'), verifyImages, (req, res) => res.json({ mime: req.file.mimetype }));
  app.use(uploadErrorHandler);
  const { server, base } = await listen(app);
  try {
    const send = (buf, type, name = 'a.png') => {
      const fd = new FormData();
      fd.append('image', new Blob([buf], { type }), name);
      return fetch(`${base}/up`, { method: 'POST', body: fd });
    };
    const ok = await send(PNG, 'image/png');
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).mime, 'image/png');
    assert.equal((await send(HTML, 'text/html', 'a.html')).status, 400);
    assert.equal((await send(HTML, 'image/jpeg', 'a.jpg')).status, 400);
    assert.equal((await send(Buffer.concat([PNG, Buffer.alloc(4000)]), 'image/png')).status, 413);
  } finally {
    server.close();
  }
});

test('quota: allows up to the limit, then 429 with Retry-After; separate callers are independent', async () => {
  _resetQuotaMemory();
  let t = 1_000_000;
  const app = express();
  app.set('trust proxy', true);
  app.get('/costly', quota({ name: 'tryon', limit: 2, windowMs: 60_000, redis: null, now: () => t }), (req, res) => res.json({ ok: true }));
  const { server, base } = await listen(app);
  try {
    const hit = (ip) => fetch(`${base}/costly`, { headers: { 'x-forwarded-for': ip } });
    assert.equal((await hit('1.1.1.1')).status, 200);
    const second = await hit('1.1.1.1');
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('x-quota-remaining'), '0');
    const third = await hit('1.1.1.1');
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get('retry-after')) >= 1);
    assert.equal((await hit('2.2.2.2')).status, 200, 'another caller has its own budget');
    t += 61_000;
    assert.equal((await hit('1.1.1.1')).status, 200, 'window resets');
  } finally {
    server.close();
  }
});

test('quota: anonymous callers get the lower limit, signed-in users the higher one', async () => {
  _resetQuotaMemory();
  process.env.JWT_SECRET = 'test-secret';
  const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
  assert.equal(callerKey({ headers: { authorization: `Bearer ${token}` }, ip: '9.9.9.9' }), 'u:user123');
  assert.equal(callerKey({ headers: { authorization: 'Bearer garbage' }, ip: '9.9.9.9' }), 'ip:9.9.9.9');

  const app = express();
  app.get('/x', quota({ name: 'q', limit: 3, anonymousLimit: 1, windowMs: 60_000, redis: null }), (req, res) => res.json({}));
  const { server, base } = await listen(app);
  try {
    assert.equal((await fetch(`${base}/x`)).status, 200);
    assert.equal((await fetch(`${base}/x`)).status, 429, 'anonymous limit is 1');
    const auth = { headers: { authorization: `Bearer ${token}` } };
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${base}/x`, auth)).status, 200);
    assert.equal((await fetch(`${base}/x`, auth)).status, 429);
  } finally {
    server.close();
  }
});

test('quota fails open when the store errors', async () => {
  const broken = { incr: async () => { throw new Error('redis down'); } };
  const app = express();
  app.get('/x', quota({ name: 'q', limit: 1, windowMs: 1000, redis: broken }), (req, res) => res.json({ ok: 1 }));
  const { server, base } = await listen(app);
  try {
    assert.equal((await fetch(`${base}/x`)).status, 200);
    assert.equal((await fetch(`${base}/x`)).status, 200);
  } finally {
    server.close();
  }
});
