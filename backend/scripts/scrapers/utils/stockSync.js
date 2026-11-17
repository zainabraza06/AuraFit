/**
 * stockSync.js — decide which products have sold out, safely.
 *
 * After scraping a brand, any in-stock product NOT seen in that run is treated as gone.
 * That is only trustworthy when the run itself looks healthy. If a retailer blocks us,
 * or half the collections 404, "not seen" means "we failed", not "sold out", and blindly
 * marking would hide a whole brand. So the update is skipped when the run looks broken.
 */

const DEFAULTS = {
  minRatio: 0.3,        // seen fewer than 30% of what we believe is in stock  -> suspicious
  minBaseline: 20,      // ...but only judge brands with a meaningful catalog
  maxFailedShare: 0.34, // more than a third of collections failed              -> incomplete run
};

/**
 * Pure decision. Returns { mark: boolean, reason?: string }.
 * @param {{ seenCount: number, inStockCount: number, failedCollections?: number, totalCollections?: number,
 *           minRatio?: number, minBaseline?: number, maxFailedShare?: number, allowMass?: boolean }} input
 */
export function decideStockUpdate(input) {
  const { seenCount, inStockCount, failedCollections = 0, totalCollections = 0, allowMass = false } = input;
  const minRatio = input.minRatio ?? DEFAULTS.minRatio;
  const minBaseline = input.minBaseline ?? DEFAULTS.minBaseline;
  const maxFailedShare = input.maxFailedShare ?? DEFAULTS.maxFailedShare;

  if (seenCount === 0) return { mark: false, reason: 'no products seen - the run probably failed' };
  if (allowMass) return { mark: true };

  if (totalCollections > 0 && failedCollections / totalCollections > maxFailedShare) {
    return { mark: false, reason: `${failedCollections}/${totalCollections} collections failed - run is incomplete` };
  }
  if (inStockCount >= minBaseline && seenCount < inStockCount * minRatio) {
    return { mark: false, reason: `saw only ${seenCount} of ${inStockCount} in-stock products (<${Math.round(minRatio * 100)}%) - looks like blocking, not sell-outs` };
  }
  return { mark: true };
}

/**
 * Mark in-stock products of `brand` that were not in `seenUrls` as out of stock - if the run is trustworthy.
 * @returns {Promise<{ marked: number, skipped: boolean, reason?: string }>}
 */
export async function markUnseenOutOfStock(Model, brand, seenUrls, runInfo = {}) {
  const inStockCount = await Model.countDocuments({ brand, inStock: { $ne: false } });
  const allowMass = String(process.env.SCRAPER_ALLOW_MASS_OOS || '').toLowerCase() === 'true';
  const decision = decideStockUpdate({ seenCount: seenUrls.size, inStockCount, allowMass, ...runInfo });
  if (!decision.mark) return { marked: 0, skipped: true, reason: decision.reason };

  const res = await Model.updateMany(
    { brand, productUrl: { $nin: [...seenUrls] }, inStock: { $ne: false } },
    { $set: { inStock: false, stockLastChecked: new Date() } }
  );
  return { marked: res.modifiedCount, skipped: false };
}
