import { getRedis } from '../config/redis.js';

/**
 * Read-through response cache for idempotent GET endpoints.
 * Keyed on the full URL (path + query). Adds `X-Cache: HIT|MISS|COALESCED` so the behaviour is visible in
 * curl and load tests.
 *
 *  - With Redis (REDIS_URL): shared across API instances. Fail-open: any Redis problem bypasses the cache.
 *  - Without Redis: a small in-process cache with the same TTL, PLUS request coalescing: when N identical GETs
 *    arrive while the first is still running, the handler runs once and the others get its answer. (This used to
 *    be a no-op without Redis, so every "cached" endpoint hit the database on every request; the load test showed
 *    5 req/s and multi-second p95 on the product list.)
 */

const MEMORY_MAX_ENTRIES = Number(process.env.RESPONSE_CACHE_MAX_ENTRIES || 500);
const memory = new Map(); // key -> { at, ttlMs, json }
const inflight = new Map(); // key -> Promise<string|null>

export function _clearMemoryCache() {
  memory.clear();
  inflight.clear();
}

export function _memoryCacheSize() {
  return memory.size;
}

function memoryCache(ttlSeconds, now) {
  const ttlMs = ttlSeconds * 1000;
  return async (req, res, next) => {
    const key = req.originalUrl;
    const t = now();
    const hit = memory.get(key);
    if (hit && t - hit.at < ttlMs) {
      res.set('X-Cache', 'HIT');
      return res.type('application/json').send(hit.json);
    }

    const pending = inflight.get(key);
    if (pending) {
      const json = await pending.catch(() => null);
      if (json) {
        res.set('X-Cache', 'COALESCED');
        return res.type('application/json').send(json);
      }
      return next(); // the first request failed or was not cacheable: do our own
    }

    let settle;
    const promise = new Promise((resolve) => { settle = resolve; });
    inflight.set(key, promise);
    const release = (json) => {
      if (inflight.get(key) === promise) inflight.delete(key);
      settle(json);
    };

    res.set('X-Cache', 'MISS');
    const sendJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        const json = JSON.stringify(body);
        memory.set(key, { at: now(), ttlMs, json });
        if (memory.size > MEMORY_MAX_ENTRIES) memory.delete(memory.keys().next().value); // oldest first
        release(json);
      } else {
        release(null);
      }
      return sendJson(body);
    };
    // handler threw / client went away without a 200: never leave waiters hanging
    res.on?.('close', () => release(null));
    next();
  };
}

export function cacheResponse(ttlSeconds = 60, { redis = getRedis, now = Date.now } = {}) {
  const local = memoryCache(ttlSeconds, now);
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const client = redis();
    if (!client) return local(req, res, next);

    const key = `api:cache:${req.originalUrl}`;
    try {
      const hit = await client.get(key);
      if (hit) {
        res.set('X-Cache', 'HIT');
        return res.type('application/json').send(hit);
      }
    } catch {
      return next();
    }

    res.set('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        client.set(key, JSON.stringify(body), 'EX', ttlSeconds).catch(() => {});
      }
      return json(body);
    };
    next();
  };
}
