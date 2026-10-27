import { EVENT_TYPES } from '../common/topics.js';

const isDuplicateKey = (err) => err?.code === 11000;

/**
 * Persists a validated event and folds it into the current product state.
 * The unique eventId index turns a replay into a no-op even if Redis was flushed.
 *
 * @returns {Promise<{outcome: 'stored'|'duplicate', priceDrop?: object}>}
 */
export function createStore({ ProductState, ProcessedEvent }) {
  return {
    async save(event) {
      const { payload } = event;
      try {
        await ProcessedEvent.create({
          eventId: event.eventId,
          type: event.type,
          productUrl: payload.productUrl,
          occurredAt: new Date(event.occurredAt),
          payload,
        });
      } catch (err) {
        if (isDuplicateKey(err)) return { outcome: 'duplicate' };
        throw err;
      }

      const incoming = event.type === EVENT_TYPES.PRICE_CHANGED ? payload.newPrice : payload.price;
      const previous = await ProductState.findOne({ productUrl: payload.productUrl }, 'price lastEventAt').lean();
      const now = new Date(event.occurredAt);

      // discovered and price_changed travel on different topics, so Kafka gives no ordering
      // between them. Only let an event overwrite state if it is not older than what is stored.
      const isStale = previous?.lastEventAt && previous.lastEventAt > now;
      const fresh = { brand: payload.brand, name: payload.name, price: incoming, currency: payload.currency, lastEventAt: now };
      if (payload.imageUrl) fresh.imageUrl = payload.imageUrl;

      await ProductState.updateOne(
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
        { upsert: true, updatePipeline: true },
      );

      const oldPrice = previous?.price ?? (event.type === EVENT_TYPES.PRICE_CHANGED ? payload.oldPrice : undefined);
      const priceDrop = !isStale && oldPrice !== undefined && incoming < oldPrice
        ? { productUrl: payload.productUrl, name: payload.name, brand: payload.brand, oldPrice, newPrice: incoming, currency: payload.currency }
        : undefined;

      return { outcome: 'stored', priceDrop };
    },
  };
}
