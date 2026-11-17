import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, assertSafeUrlShape, safeGetBuffer, safeLookup, UnsafeUrlError } from '../utils/safeFetch.js';

test('isPrivateIp: private, loopback, metadata, CGNAT and mapped v6 are blocked; public is allowed', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '104.18.2.2', '2606:4700::1111']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('assertSafeUrlShape rejects bad schemes, credentials, ports and local hosts', () => {
  for (const u of ['file:///etc/passwd', 'ftp://a.com/x', 'http://user:pw@a.com/', 'http://a.com:6379/', 'http://localhost/x', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'http://svc.internal/', 'not a url']) {
    assert.throws(() => assertSafeUrlShape(u), UnsafeUrlError, u);
  }
  assert.equal(assertSafeUrlShape('https://cdn.shopify.com/a.jpg').hostname, 'cdn.shopify.com');
});

test('safeLookup refuses a hostname that resolves to loopback', async () => {
  await assert.rejects(() => new Promise((res, rej) => safeLookup('localhost', {}, (e, a) => (e ? rej(e) : res(a)))), UnsafeUrlError);
});

test('safeGetBuffer re-checks every redirect hop', async () => {
  const calls = [];
  const requestFn = async (cfg) => {
    calls.push(cfg.url);
    return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' }, data: Buffer.alloc(0) };
  };
  await assert.rejects(() => safeGetBuffer('https://example.com/a.jpg', { requestFn }), UnsafeUrlError);
  assert.equal(calls.length, 1, 'must not request the internal address');
});

test('safeGetBuffer returns bytes and passes the guarded lookup and size cap', async () => {
  let seen;
  const requestFn = async (cfg) => { seen = cfg; return { status: 200, headers: { 'content-type': 'image/png' }, data: Buffer.from([1, 2, 3]) }; };
  const out = await safeGetBuffer('https://example.com/a.png', { requestFn, maxBytes: 99 });
  assert.deepEqual([...out.data], [1, 2, 3]);
  assert.equal(out.contentType, 'image/png');
  assert.equal(seen.lookup, safeLookup);
  assert.equal(seen.maxContentLength, 99);
  assert.equal(seen.maxRedirects, 0);
});

test('safeGetBuffer gives up after too many redirects', async () => {
  const requestFn = async () => ({ status: 301, headers: { location: 'https://example.com/next' }, data: Buffer.alloc(0) });
  await assert.rejects(() => safeGetBuffer('https://example.com/a', { requestFn, maxRedirects: 2 }), /Too many redirects/);
});
