import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildFeedbackEvent, actorHash, createFeedbackPublisher, feedbackEventId } from '../events/feedbackEvents.js';
import { registry } from '../observability/metrics.js';

let app;
before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_jwt_secret';
  process.env.FEEDBACK_SALT = 'unit-salt';
  const { createApp } = await import('../app.js');
  app = createApp();
});

const body = (over = {}) => ({ action: 'result_click', clientEventId: 'evt-12345678', surface: 'search', productUrl: 'https://b.pk/p/1', catalog: 'clothing', query: 'red lehnga', position: 1, sessionId: 'sess-abcdefgh', ...over });

test('accepts valid feedback with 202 and publishes a privacy-safe event', async () => {
  const sent = [];
  app.locals.feedbackSend = async (e) => { sent.push(e); return 'sent'; };
  const res = await request(app).post('/api/feedback').send(body());
  assert.equal(res.status, 202);
  assert.equal(sent.length, 1);
  const e = sent[0];
  assert.equal(e.type, 'user.feedback');
  assert.equal(e.payload.action, 'result_click');
  assert.equal(e.payload.actor, actorHash('sess-abcdefgh'));
  assert.ok(!JSON.stringify(e).includes('sess-abcdefgh'), 'the raw session id must not leave the API');
  assert.equal(res.body.eventId, e.eventId);
});

test('a signed-in user is identified by a hash of their user id, not the client session', async () => {
  const sent = [];
  app.locals.feedbackSend = async (e) => { sent.push(e); return 'sent'; };
  const token = jwt.sign({ id: 'user-42' }, process.env.JWT_SECRET);
  await request(app).post('/api/feedback').set('Authorization', `Bearer ${token}`).send(body());
  assert.equal(sent[0].payload.actor, actorHash('u:user-42'));
  assert.ok(!JSON.stringify(sent[0]).includes('user-42'));
});

test('a retried POST has the same event id (idempotent downstream)', () => {
  const a = buildFeedbackEvent(body(), 's');
  const b = buildFeedbackEvent(body({ query: 'edited' }), 's');
  assert.equal(a.eventId, b.eventId);
  assert.notEqual(a.eventId, buildFeedbackEvent(body(), 'other').eventId);
  assert.equal(a.eventId, feedbackEventId(a.payload));
});

test('rejects malformed feedback with 400 and does not publish', async () => {
  let calls = 0;
  app.locals.feedbackSend = async () => { calls++; return 'sent'; };
  for (const bad of [{ action: 'explode' }, { clientEventId: 'x' }, { productUrl: 'not a url' }, { catalog: 'cars' }]) {
    assert.equal((await request(app).post('/api/feedback').send(body(bad))).status, 400, JSON.stringify(bad));
  }
  assert.equal(calls, 0);
});

test('a broker outage never fails the request: still 202, counted as failed', async () => {
  app.locals.feedbackSend = createFeedbackPublisher({ enabled: true, publish: async () => { throw new Error('broker down'); } });
  const res = await request(app).post('/api/feedback').send(body({ clientEventId: 'evt-outage01' }));
  assert.equal(res.status, 202);
  assert.match(await registry.metrics(), /feedback_events_total\{action="result_click",result="failed"\} \d+/);
});

test('pipeline disabled: accepted and dropped without touching Kafka', async () => {
  let published = false;
  const send = createFeedbackPublisher({ enabled: false, publish: async () => { published = true; } });
  assert.equal(await send({}), 'disabled');
  assert.equal(published, false);
});
