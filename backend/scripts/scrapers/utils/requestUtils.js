/**
 * requestUtils.js
 * HTTP request helpers: delays, retries, timeout, user-agent rotation.
 * All scrapers must use these utilities to avoid aggressive scraping.
 */

import axios from 'axios';

// ─── User-Agent Pool ──────────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];

export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function defaultHeaders() {
  return {
    'User-Agent': randomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  };
}

export function jsonHeaders() {
  return {
    'User-Agent': randomUserAgent(),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9'
  };
}

// ─── Delay ────────────────────────────────────────────────────────────────────
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Randomized delay: base ± 30% jitter to avoid pattern detection */
export async function politeSleep(baseMs) {
  const base = baseMs ?? Number(process.env.SCRAPER_DELAY_MS ?? 1500);
  const jitter = Math.floor(base * 0.3 * (Math.random() * 2 - 1));
  await delay(Math.max(500, base + jitter));
}

// ─── Retry wrapper ────────────────────────────────────────────────────────────
/**
 * Executes `fn` up to `retries` times, doubling the delay between attempts.
 * @param {Function} fn       Async function returning a value
 * @param {number}   retries  Max attempts (default from env)
 * @param {number}   baseDelay Initial delay between retries in ms
 */
export async function withRetry(fn, retries, baseDelay = 1000) {
  const maxRetries = retries ?? Number(process.env.SCRAPER_RETRY_LIMIT ?? 3);
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const wait = baseDelay * Math.pow(2, attempt - 1); // exponential backoff
        await delay(wait);
      }
    }
  }
  throw lastErr;
}

// ─── Axios instance ───────────────────────────────────────────────────────────
export function createAxiosInstance(timeoutMs = 15000) {
  return axios.create({
    timeout: timeoutMs,
    headers: defaultHeaders(),
    maxRedirects: 5
  });
}

/**
 * Safe GET — returns { data, status } or throws on non-2xx.
 */
export async function safeGet(url, options = {}) {
  const { timeout = 15000, responseType = 'json', extraHeaders = {} } = options;
  const instance = createAxiosInstance(timeout);
  const response = await instance.get(url, {
    headers: { ...defaultHeaders(), ...extraHeaders },
    responseType
  });
  return response;
}
