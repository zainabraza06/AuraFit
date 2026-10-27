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
      const previous = await ProductState.findOne({ productUrl: payload.productUrl }, 'price').lean();
      const now = new Date(event.occurredAt);

      await ProductState.updateOne(
        { productUrl: payload.productUrl },
        {
          $set: {
            brand: payload.brand,
            name: payload.name,
            price: incoming,
            currency: payload.currency,
            ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
            lastEventAt: now,
          },
          $setOnInsert: { firstSeenAt: now },
        },
        { upsert: true },
      );

      const oldPrice = previous?.price ?? (event.type === EVENT_TYPES.PRICE_CHANGED ? payload.oldPrice : undefined);
      const priceDrop = oldPrice !== undefined && incoming < oldPrice
        ? { productUrl: payload.productUrl, name: payload.name, brand: payload.brand, oldPrice, newPrice: incoming, currency: payload.currency }
        : undefined;

      return { outcome: 'stored', priceDrop };
    },
  };
}
