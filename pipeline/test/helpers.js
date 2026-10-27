/** Minimal in-memory stand-in for the ioredis calls the pipeline uses. */
export function fakeRedis() {
  const store = new Map();
  return {
    store,
    async exists(k) { return store.has(k) ? 1 : 0; },
    async get(k) { return store.get(k) ?? null; },
    async set(k, v, ...args) {
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
    async eval(_script, _n, k, token) {
      if (store.get(k) === token) { store.delete(k); return 1; }
      return 0;
    },
  };
}
