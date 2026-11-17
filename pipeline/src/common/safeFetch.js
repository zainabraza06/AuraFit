/**
 * safeFetch.js — SSRF guard for every server-side download of a user- or scraper-supplied URL.
 *
 * Blocks: non-http(s) schemes, URLs with credentials, non-standard ports, and any host that
 * resolves to a private / loopback / link-local / metadata address. The address check happens in
 * the socket `lookup` hook, so it applies to the IP actually connected to (defeats DNS rebinding),
 * and redirects are followed by hand so every hop is checked again.
 */
import dns from 'node:dns';
import net from 'node:net';
import axios from 'axios';

const ALLOWED_PORTS = new Set(['', '80', '443']);

/** True for addresses that must never be reachable from a user-supplied URL. */
export function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v); // unique-local fc00::/7, link-local fe80::/10
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // not an IP: refuse
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||           // link-local + cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                              // multicast + reserved
  );
}

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.status = 400;
  }
}

/** Syntax-level checks (no network). Returns the parsed URL. */
export function assertSafeUrlShape(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new UnsafeUrlError('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrlError('Only http(s) URLs are allowed');
  if (u.username || u.password) throw new UnsafeUrlError('URLs with credentials are not allowed');
  if (!ALLOWED_PORTS.has(u.port)) throw new UnsafeUrlError('Port not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateIp(host)) throw new UnsafeUrlError('Address not allowed');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new UnsafeUrlError('Host not allowed');
  }
  return u;
}

/** dns.lookup replacement that refuses private results. Used as the socket `lookup`. */
export function safeLookup(hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : { ...options };
  dns.lookup(hostname, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: net.isIPv6(addrs) ? 6 : 4 }];
    const bad = list.find((a) => isPrivateIp(a.address));
    if (bad || list.length === 0) return cb(new UnsafeUrlError('Host resolves to a disallowed address'));
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

/**
 * GET a URL as bytes with the guard applied.
 * @returns {Promise<{ data: Buffer, contentType: string, finalUrl: string }>}
 */
export async function safeGetBuffer(url, { timeout = 15000, maxBytes = 10 * 1024 * 1024, maxRedirects = 3, requestFn = axios.request } = {}) {
  let current = assertSafeUrlShape(url).toString();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await requestFn({
      url: current,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
      lookup: safeLookup,
    });
    if (res.status >= 300) {
      const loc = res.headers?.location;
      if (!loc) throw new UnsafeUrlError('Redirect without location');
      current = assertSafeUrlShape(new URL(loc, current)).toString();
      continue;
    }
    return { data: Buffer.from(res.data), contentType: res.headers?.['content-type'] || '', finalUrl: current };
  }
  throw new UnsafeUrlError('Too many redirects');
}
