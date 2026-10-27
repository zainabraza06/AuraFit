/**
 * config.js — single place where env vars are read.
 * Every service imports this instead of touching process.env directly.
 */
const list = (v, fallback) => (v || fallback).split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  kafka: {
    brokers: list(process.env.KAFKA_BROKERS, 'localhost:9092'),
    clientId: process.env.KAFKA_CLIENT_ID || 'aurafit-pipeline',
    groupId: process.env.KAFKA_GROUP_ID || 'aurafit-consumers',
  },
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/aurafit_pipeline',
  metricsPort: Number(process.env.METRICS_PORT || 9100),
  logLevel: process.env.LOG_LEVEL || 'info',
  dedupeTtlSeconds: Number(process.env.DEDUPE_TTL_SECONDS || 86400),
  maxRetries: Number(process.env.MAX_RETRIES || 3),
};
