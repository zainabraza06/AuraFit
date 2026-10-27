const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retries fn with linear backoff. Used for dependencies that report "healthy" a beat before they accept connections. */
export async function retry(fn, { attempts = 10, delayMs = 1000, onRetry = () => {} } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      onRetry(err, i);
      await sleep(delayMs * i);
    }
  }
}
