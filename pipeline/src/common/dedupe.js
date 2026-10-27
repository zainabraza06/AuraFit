/**
 * Redis-backed idempotency check.
 *
 * Two-step on purpose (has -> process -> mark) instead of claim-first: if we
 * claimed before storing and the store then failed, the retry would be wrongly
 * dropped as a duplicate. The durable backstop is the unique eventId index in
 * Mongo, so a Redis flush can never cause a double write.
 */
const key = (id) => `evt:seen:${id}`;

export function createDedupe(redis, ttlSeconds) {
  return {
    async has(eventId) {
      return (await redis.exists(key(eventId))) === 1;
    },
    async mark(eventId) {
      await redis.set(key(eventId), '1', 'EX', ttlSeconds);
    },
  };
}
