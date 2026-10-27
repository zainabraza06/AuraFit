import { randomUUID } from 'node:crypto';

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/**
 * Distributed lock (SET NX PX + token-checked release), so two workers never
 * process the same item. The token stops a slow worker releasing a lock that
 * has already expired and been re-acquired by someone else.
 *
 * @returns {Promise<null | (() => Promise<boolean>)>} release function, or null if held elsewhere
 */
export async function acquireLock(redis, name, ttlMs = 30000) {
  const token = randomUUID();
  const key = `lock:${name}`;
  const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (ok !== 'OK') return null;
  return async () => (await redis.eval(RELEASE, 1, key, token)) === 1;
}

export async function withLock(redis, name, ttlMs, fn) {
  const release = await acquireLock(redis, name, ttlMs);
  if (!release) return { locked: false };
  try {
    return { locked: true, value: await fn() };
  } finally {
    await release();
  }
}
