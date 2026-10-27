import { withLock } from '../common/lock.js';

/**
 * Wraps a job handler so each (queue, eventId) runs at most once to completion:
 *  - a Redis lock stops two workers processing the same item concurrently
 *  - a done-marker stops a redelivered/republished job from running twice
 * If the lock is held, we throw so RabbitMQ retries later instead of dropping the job.
 */
export function idempotent(redis, queue, handler, { lockTtlMs = 60000, doneTtlSeconds = 86400 } = {}) {
  return async (job, ctx) => {
    const doneKey = `job:done:${queue}:${job.eventId}`;
    if (await redis.exists(doneKey)) return 'done';

    const res = await withLock(redis, `${queue}:${job.eventId}`, lockTtlMs, async () => {
      if (await redis.exists(doneKey)) return;
      await handler(job, ctx);
      await redis.set(doneKey, '1', 'EX', doneTtlSeconds);
    });
    if (!res.locked) throw new Error('job locked by another worker');
    return 'done';
  };
}
