/**
 * Price-drop notification job. Delivery is abstracted behind `deliver` (email/push
 * provider in production); here every notification is persisted so it is auditable.
 */
export function createNotifyJob({ deliver, logger }) {
  return async function run(job) {
    const pct = Math.round(((job.oldPrice - job.newPrice) / job.oldPrice) * 100);
    const message = `${job.brand}: "${job.name}" dropped ${pct}% (${job.currency} ${job.oldPrice} -> ${job.newPrice})`;
    await deliver({ productUrl: job.productUrl, message, pct, eventId: job.eventId });
    logger.info('price-drop notification sent', { productUrl: job.productUrl, pct });
  };
}
