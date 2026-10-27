import { getRedis } from '../config/redis.js';

/**
 * Read-through response cache for idempotent GET endpoints.
 * Keyed on the full URL (path + query). Fail-open: any Redis problem simply
 * bypasses the cache, so Redis being down never takes the API down.
 * Adds `X-Cache: HIT|MISS` so the behaviour is visible in curl / load tests.
 */
export function cacheResponse(ttlSeconds = 60, { redis = getRedis } = {}) {
  return async (req, res, next) => {
    const client = redis();
    if (!client || req.method !== 'GET') return next();

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
