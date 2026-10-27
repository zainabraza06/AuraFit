import Redis from 'ioredis';
import { config } from './config.js';

export function createRedis(url = config.redisUrl) {
  return new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
}
