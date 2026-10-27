import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EVENT_TYPES } from './topics.js';

const money = z.number().finite().nonnegative();

const discoveredPayload = z.object({
  productUrl: z.string().url(),
  brand: z.string().min(1),
  name: z.string().min(1).max(200),
  price: money,
  compareAtPrice: money.nullish(),
  currency: z.string().length(3).default('PKR'),
  imageUrl: z.string().url().nullish(),
  category: z.string().nullish(),
  subCategory: z.string().nullish(),
});

const priceChangedPayload = z.object({
  productUrl: z.string().url(),
  brand: z.string().min(1),
  name: z.string().min(1).max(200),
  oldPrice: money,
  newPrice: money,
  currency: z.string().length(3).default('PKR'),
  imageUrl: z.string().url().nullish(),
});

export const PAYLOAD_SCHEMAS = {
  [EVENT_TYPES.DISCOVERED]: discoveredPayload,
  [EVENT_TYPES.PRICE_CHANGED]: priceChangedPayload,
};

const envelope = z.object({
  eventId: z.string().min(8),
  type: z.enum([EVENT_TYPES.DISCOVERED, EVENT_TYPES.PRICE_CHANGED]),
  version: z.literal(1),
  occurredAt: z.string().datetime(),
  source: z.string().min(1),
  payload: z.record(z.any()),
});

/**
 * Deterministic id: the same logical fact always hashes to the same eventId,
 * so a producer retry or a Kafka redelivery can be recognised as a duplicate.
 */
export function eventIdFor(type, payload) {
  const basis = type === EVENT_TYPES.PRICE_CHANGED
    ? [type, payload.productUrl, payload.oldPrice, payload.newPrice]
    : [type, payload.productUrl, payload.price];
  return createHash('sha256').update(basis.join('|')).digest('hex').slice(0, 32);
}

export function buildEvent(type, payload, source = 'scraper') {
  return {
    eventId: eventIdFor(type, payload),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    source,
    payload,
  };
}

/** Kafka key: every event for a product lands on one partition, preserving per-product order. */
export const partitionKey = (event) => event.payload.productUrl;

/**
 * Validates an unknown value as an event.
 * @returns {{ok: true, event: object} | {ok: false, reason: string}}
 */
export function validateEvent(raw) {
  const env = envelope.safeParse(raw);
  if (!env.success) return { ok: false, reason: `envelope: ${env.error.issues[0].message} (${env.error.issues[0].path.join('.')})` };
  const body = PAYLOAD_SCHEMAS[env.data.type].safeParse(env.data.payload);
  if (!body.success) return { ok: false, reason: `payload: ${body.error.issues[0].message} (${body.error.issues[0].path.join('.')})` };
  return { ok: true, event: { ...env.data, payload: body.data } };
}
