import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryLimitMB, localModelPolicy, MIN_MB_TEXT_MODEL, MIN_MB_BOTH_MODELS } from '../services/memoryProfile.js';

const MB = 1048576;
const fsWith = (files) => (file) => {
  if (!(file in files)) throw new Error('ENOENT');
  return files[file];
};

test('a 512 MB container limit wins over the host RAM that os.totalmem() reports', () => {
  const limit = memoryLimitMB({ readFile: fsWith({ '/sys/fs/cgroup/memory.max': String(512 * MB) }), totalmem: () => 16 * 1024 * MB });
  assert.equal(limit, 512);
});

test('cgroup v1 limit is read too; "max" and the v1 "unlimited" sentinel fall back to the machine RAM', () => {
  assert.equal(memoryLimitMB({ readFile: fsWith({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': String(1024 * MB) }), totalmem: () => 8 * 1024 * MB }), 1024);
  assert.equal(memoryLimitMB({ readFile: fsWith({ '/sys/fs/cgroup/memory.max': 'max' }), totalmem: () => 4 * 1024 * MB }), 4096);
  assert.equal(memoryLimitMB({ readFile: fsWith({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': '9223372036854771712' }), totalmem: () => 2 * 1024 * MB }), 2048);
  assert.equal(memoryLimitMB({ readFile: fsWith({}), totalmem: () => 3 * 1024 * MB }), 3072, 'no cgroup files (a laptop): total RAM');
});

test('policy: small hosts get no local models; mid hosts text only; large hosts both', () => {
  const small = localModelPolicy({ env: {}, limitMB: 512 });
  assert.deepEqual([small.text, small.image], [false, false]);
  assert.match(small.reason, /keyword search/);
  const mid = localModelPolicy({ env: {}, limitMB: MIN_MB_TEXT_MODEL });
  assert.deepEqual([mid.text, mid.image], [true, false]);
  const big = localModelPolicy({ env: {}, limitMB: MIN_MB_BOTH_MODELS });
  assert.deepEqual([big.text, big.image], [true, true]);
  assert.deepEqual([localModelPolicy({ env: {}, limitMB: 1024 }).text], [false], '1 GB is still too small for a 920 MB model');
});

test('LOCAL_MODELS forces the decision either way', () => {
  assert.equal(localModelPolicy({ env: { LOCAL_MODELS: 'true' }, limitMB: 512 }).text, true);
  assert.equal(localModelPolicy({ env: { LOCAL_MODELS: 'FALSE' }, limitMB: 16000 }).text, false);
  assert.match(localModelPolicy({ env: { LOCAL_MODELS: 'false' }, limitMB: 16000 }).reason, /LOCAL_MODELS/);
});
