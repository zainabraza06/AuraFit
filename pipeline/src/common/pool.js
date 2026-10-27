/**
 * Runs fn over items with at most `limit` in flight. Rejects on the first failure,
 * after which no new items are started (already-started ones are left to finish).
 */
export async function mapLimit(items, limit, fn) {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        await fn(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
