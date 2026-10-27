/**
 * redis.js — optional shared Redis client.
 * Returns null when REDIS_URL is unset so the API runs unchanged without Redis
 * (local dev, tests). Callers must treat null as "feature off".
 */
import Redis from 'ioredis';

let client;

export function getRedis() {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  if (!url || process.env.NODE_ENV === 'test') return (client = null);

  client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  client.on('error', (err) => console.warn('[redis]', err.message));
  return client;
}
