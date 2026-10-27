import { EVENT_TYPES } from '../common/topics.js';

const isDuplicateKey = (err) => err?.code === 11000;

/**
 * Persists a validated event and folds it into the current product state.
 *
 * The event record is two-phase so a crash can never lose work:
 *   save()      inserts the record as `pending`, applies state, returns what jobs to enqueue
 *   complete()  marks it `done` - the caller does this only AFTER the jobs are enqueued
 * A redelivery of a `pending` event resumes (re-applies state, which is idempotent, and
 * re-offers the jobs, which workers de-duplicate). A redelivery of a `done` event is a no-op.
 * The unique eventId index is what makes replays safe even if Redis was flushed.
 *
 * @returns {Promise<{outcome: 'stored'|'duplicate', priceDrop?: object}>}
 */
export function createStore({ ProductState, ProcessedEvent }) {
  // Raw driver collections on purpose: this is the hot path, and Mongoose's per-document
  // hydration/casting made the consumer CPU-bound. Schemas/indexes are still defined in db.js.
  const products = ProductState.collection;
  const events = ProcessedEvent.collection;
  return {
    async save(event) {
      const { payload } = event;
      const incoming = event.type === EVENT_TYPES.PRICE_CHANGED ? payload.newPrice : payload.price;
      const now = new Date(event.occurredAt);

      const previous = await products.findOne({ productUrl: payload.productUrl }, { projection: { price: 1, lastEventAt: 1 } });
      // discovered and price_changed travel on different topics, so Kafka gives no ordering
      // between them. An older event must never overwrite, or flag a drop against, newer state.
      const isStale = Boolean(previous?.lastEventAt && previous.lastEventAt > now);
      const oldPrice = previous?.price ?? (event.type === EVENT_TYPES.PRICE_CHANGED ? payload.oldPrice : undefined);
      let priceDrop = !isStale && oldPrice !== undefined && incoming < oldPrice
        ? { productUrl: payload.productUrl, name: payload.name, brand: payload.brand, oldPrice, newPrice: incoming, currency: payload.currency }
        : undefined;

      try {
        await events.insertOne({
          eventId: event.eventId,
          type: event.type,
          productUrl: payload.productUrl,
          occurredAt: now,
          payload,
          status: 'pending',
          priceDrop,
          storedAt: new Date(),
        });
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        const existing = await events.findOne({ eventId: event.eventId }, { projection: { status: 1, priceDrop: 1 } });
        if (existing?.status !== 'pending') return { outcome: 'duplicate' };
        // Resume an interrupted attempt: reuse the drop decided the first time.
        priceDrop = existing.priceDrop ?? undefined;
      }

      const fresh = { brand: payload.brand, name: payload.name, price: incoming, currency: payload.currency, lastEventAt: now };
      if (payload.imageUrl) fresh.imageUrl = payload.imageUrl;

      await products.updateOne(
        { productUrl: payload.productUrl },
        [{
          $set: {
            firstSeenAt: { $ifNull: ['$firstSeenAt', now] },
            ...Object.fromEntries(Object.entries(fresh).map(([k, v]) => [
              k,
              { $cond: [{ $gte: [now, { $ifNull: ['$lastEventAt', new Date(0)] }] }, { $literal: v }, `$${k}`] },
            ])),
          },
        }],
        { upsert: true },
      );

      return { outcome: 'stored', priceDrop };
    },

    async complete(eventId) {
      await events.updateOne({ eventId }, { $set: { status: 'done' } });
    },
  };
}
