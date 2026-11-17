/**
 * tryonQueue.js — virtual try-on as a background job instead of a 60-120 s blocked HTTP request.
 *
 *   submit()  -> returns a job immediately (queued | running | done from cache)
 *   status    queued -> running -> done | failed          (poll GET, or subscribe via SSE)
 *
 * Properties (all unit-tested):
 *  - Bounded concurrency (MAX_CONCURRENT) and a bounded queue: overload answers "busy" fast instead of
 *    piling up requests that each hold a socket and megabytes of image buffers.
 *  - Result cache keyed by a hash of the INPUT IMAGES + description: the same person + garment returns
 *    the earlier result for free (try-on calls cost money or scarce free-tier GPU time).
 *  - De-duplication: an identical request already queued/running is joined, not run twice.
 *  - Per-owner cap on simultaneous jobs, so one caller cannot occupy the whole queue.
 *  - A job never stays "running" forever: per-job timeout, and stale jobs from a previous process are
 *    failed on startup (their buffers died with that process).
 *  - Images are held in memory only until the job starts; only status/result metadata is persisted.
 *
 * The queue is process-local on purpose (single API instance today). The store interface is the seam
 * for moving to RabbitMQ workers later; see docs/architecture.md.
 */
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

const TERMINAL = new Set(['done', 'failed']);

/** Stable hash of what determines the output: both images and the text hint. */
export function tryonCacheKey({ person, clothing, description = '' }) {
  const h = createHash('sha256');
  for (const part of [person, clothing]) {
    h.update(part?.buffer ? part.buffer : Buffer.from(String(part?.url || '')));
    h.update('|');
  }
  h.update(String(description).slice(0, 300));
  return h.digest('hex');
}

/** In-memory store with the same interface as the Mongo one (used by tests and as a fallback). */
export function createMemoryStore() {
  const jobs = new Map();
  return {
    async save(job) { jobs.set(job.id, { ...job }); },
    async get(id) { const j = jobs.get(id); return j ? { ...j } : null; },
    async findDoneByKey(cacheKey, since) {
      return [...jobs.values()].find((j) => j.cacheKey === cacheKey && j.status === 'done' && j.finishedAt >= since) || null;
    },
    async failStale(reason) {
      let n = 0;
      for (const j of jobs.values()) if (!TERMINAL.has(j.status)) { j.status = 'failed'; j.error = reason; j.finishedAt = Date.now(); n++; }
      return n;
    },
    _jobs: jobs,
  };
}

export class QueueBusyError extends Error {
  constructor(message, code = 'busy') { super(message); this.name = 'QueueBusyError'; this.code = code; this.status = 429; }
}

/**
 * @param {{ run: (input: object) => Promise<{ resultUrl: string, provider: string }>, store?: object,
 *           maxConcurrent?: number, maxQueued?: number, maxPerOwner?: number, jobTimeoutMs?: number,
 *           cacheTtlMs?: number, now?: () => number }} opts
 */
export function createTryonQueue({ run, store = createMemoryStore(), maxConcurrent = 2, maxQueued = 20, maxPerOwner = 2, jobTimeoutMs = 240_000, cacheTtlMs = 7 * 24 * 3600 * 1000, now = Date.now }) {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const pending = []; // { job, input } waiting for a slot
  const live = new Map(); // id -> job (queued or running), also the dedupe index by cacheKey
  let running = 0;

  const view = (j) => ({ id: j.id, status: j.status, resultUrl: j.resultUrl, provider: j.provider, error: j.error, reason: j.reason, cached: j.cached || undefined, queuedAhead: j.status === 'queued' ? pending.findIndex((p) => p.job.id === j.id) : 0, createdAt: j.createdAt, finishedAt: j.finishedAt });

  async function update(job, patch) {
    Object.assign(job, patch);
    await store.save(job);
    events.emit(job.id, view(job));
  }

  async function pump() {
    while (running < maxConcurrent && pending.length) {
      const { job, input } = pending.shift();
      running++;
      execute(job, input).finally(() => { running--; pump(); });
    }
  }

  async function execute(job, input) {
    await update(job, { status: 'running', startedAt: now() });
    let timer;
    try {
      const result = await Promise.race([
        run(input),
        new Promise((_, rej) => {
          timer = setTimeout(() => rej(Object.assign(new Error('Try-on timed out'), { reason: 'timeout' })), jobTimeoutMs);
          timer.unref?.(); // a pending timeout must never keep the process alive
        }),
      ]);
      await update(job, { status: 'done', resultUrl: result.resultUrl, provider: result.provider, finishedAt: now() });
    } catch (err) {
      await update(job, { status: 'failed', error: err.userMessage || err.message, reason: err.reason || 'failed', finishedAt: now() });
    } finally {
      clearTimeout(timer);
      live.delete(job.id);
      input.person = input.clothing = null; // release the image buffers
    }
  }

  return {
    /** @returns {Promise<object>} job view; throws QueueBusyError when over a limit */
    async submit({ person, clothing, description }, ownerKey) {
      const cacheKey = tryonCacheKey({ person, clothing, description });

      const cached = await store.findDoneByKey(cacheKey, now() - cacheTtlMs);
      if (cached) {
        const job = { id: randomUUID(), owner: ownerKey, cacheKey, status: 'done', resultUrl: cached.resultUrl, provider: cached.provider, cached: true, createdAt: now(), finishedAt: now() };
        await store.save(job);
        return view(job);
      }

      for (const j of live.values()) if (j.cacheKey === cacheKey) return view(j); // identical job in flight: join it

      const ownerLive = [...live.values()].filter((j) => j.owner === ownerKey).length;
      if (ownerLive >= maxPerOwner) throw new QueueBusyError(`You already have ${ownerLive} try-ons in progress. Wait for one to finish.`, 'owner_limit');
      if (pending.length >= maxQueued) throw new QueueBusyError('Try-on is busy right now. Please try again in a minute.', 'busy');

      const job = { id: randomUUID(), owner: ownerKey, cacheKey, status: 'queued', createdAt: now() };
      live.set(job.id, job);
      await store.save(job);
      pending.push({ job, input: { person, clothing, description } });
      pump();
      return view(job);
    },

    /** Owner-scoped lookup: another caller's job id behaves like "not found". */
    async get(id, ownerKey) {
      const j = live.get(id) || (await store.get(id));
      return j && j.owner === ownerKey ? view(j) : null;
    },

    /** Subscribe to status changes. Returns an unsubscribe function. */
    subscribe(id, listener) {
      events.on(id, listener);
      return () => events.off(id, listener);
    },

    stats: () => ({ running, queued: pending.length }),
    failStale: (reason = 'server_restarted') => store.failStale(reason),
  };
}
