import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireLock, withLock } from '../src/common/lock.js';
import { fakeRedis } from './helpers.js';

test('second acquire fails while first holds the lock', async () => {
  const r = fakeRedis();
  const release = await acquireLock(r, 'item-1');
  assert.ok(release);
  assert.equal(await acquireLock(r, 'item-1'), null);
  assert.equal(await release(), true);
  assert.ok(await acquireLock(r, 'item-1'));
});

test('stale holder cannot release a lock it no longer owns', async () => {
  const r = fakeRedis();
  const releaseA = await acquireLock(r, 'x');
  r.store.set('lock:x', 'someone-else'); // A expired, B re-acquired
  assert.equal(await releaseA(), false);
  assert.equal(r.store.get('lock:x'), 'someone-else');
});

test('withLock skips fn when locked and releases on throw', async () => {
  const r = fakeRedis();
  await acquireLock(r, 'busy');
  assert.deepEqual(await withLock(r, 'busy', 1000, async () => 1), { locked: false });
  await assert.rejects(withLock(r, 'free', 1000, async () => { throw new Error('boom'); }));
  assert.ok(await acquireLock(r, 'free'));
});
