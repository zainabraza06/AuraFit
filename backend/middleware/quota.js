/**
 * quota.js — per-caller quotas for COSTLY endpoints (LLM, try-on generation, image search).
 *
 * Different from the global rate limiter: this counts expensive actions per user (or per IP when
 * anonymous) over a longer window, and reports usage in headers. Backed by Redis when REDIS_URL is
 * set (shared across API instances), otherwise a per-process map. Redis errors fail OPEN so a Redis
 * outage never blocks users; the global limiter still applies.
 */
import jwt from 'jsonwebtoken';
import { getRedis } from '../config/redis.js';

const memory = new Map(); // key -> { count, resetAt }

async function memoryHit(key, windowMs, now) {
  let e = memory.get(key);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + windowMs };
    memory.set(key, e);
  }
  e.count += 1;
  if (memory.size > 5000) for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  return { count: e.count, resetAt: e.resetAt };
}

async function redisHit(redis, key, windowMs, now) {
  const k = `quota:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.pexpire(k, windowMs);
  const ttl = await redis.pttl(k);
  return { count, resetAt: now + (ttl > 0 ? ttl : windowMs) };
}

/** Who is calling: the JWT subject when a valid token is present, otherwise the IP. Never throws. */
export function callerKey(req) {
  const h = req.headers?.authorization;
  if (h?.startsWith('Bearer ') && process.env.JWT_SECRET) {
    try {
      const { id } = jwt.verify(h.slice(7), process.env.JWT_SECRET);
      if (id) return `u:${id}`;
    } catch { /* anonymous */ }
  }
  return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

/**
 * @param {{ name: string, limit: number, windowMs: number, anonymousLimit?: number, now?: () => number, redis?: any }} opts
 */
export function quota({ name, limit, windowMs, anonymousLimit, now = Date.now, redis } = {}) {
  return async function quotaMiddleware(req, res, next) {
    const who = callerKey(req);
    const max = who.startsWith('ip:') && anonymousLimit != null ? anonymousLimit : limit;
    const t = now();
    let hit;
    try {
      const r = redis === undefined ? getRedis() : redis;
      hit = r ? await redisHit(r, `${name}:${who}`, windowMs, t) : await memoryHit(`${name}:${who}`, windowMs, t);
    } catch (err) {
      console.warn('[quota] store error, failing open:', err.message);
      return next();
    }
    res.set('X-Quota-Limit', String(max));
    res.set('X-Quota-Remaining', String(Math.max(0, max - hit.count)));
    if (hit.count > max) {
      const retry = Math.max(1, Math.ceil((hit.resetAt - t) / 1000));
      res.set('Retry-After', String(retry));
      return res.status(429).json({ error: `Daily limit reached for ${name}. Try again later.`, retryAfterSeconds: retry });
    }
    next();
  };
}

export function _resetQuotaMemory() { memory.clear(); }
