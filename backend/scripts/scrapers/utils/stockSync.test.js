import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ShoeProduct from '../../../models/ShoeProduct.js';
import { decideStockUpdate, markUnseenOutOfStock } from './stockSync.js';

test('decision: a normal run marks sold-out items', () => {
  assert.equal(decideStockUpdate({ seenCount: 180, inStockCount: 200 }).mark, true);
});

test('decision: seeing nothing never marks anything', () => {
  const d = decideStockUpdate({ seenCount: 0, inStockCount: 200 });
  assert.equal(d.mark, false);
  assert.match(d.reason, /no products seen/);
});

test('decision: a collapse to a small fraction of the catalog looks like blocking, not sell-outs', () => {
  const d = decideStockUpdate({ seenCount: 30, inStockCount: 200 });
  assert.equal(d.mark, false);
  assert.match(d.reason, /blocking/);
});

test('decision: small brands are not judged by the ratio (a tiny catalog can legitimately shrink a lot)', () => {
  assert.equal(decideStockUpdate({ seenCount: 2, inStockCount: 10 }).mark, true);
});

test('decision: too many failed collections means the run is incomplete', () => {
  assert.equal(decideStockUpdate({ seenCount: 100, inStockCount: 120, failedCollections: 3, totalCollections: 6 }).mark, false);
  assert.equal(decideStockUpdate({ seenCount: 100, inStockCount: 120, failedCollections: 1, totalCollections: 6 }).mark, true);
});

test('decision: allowMass overrides the guards (but never the empty-run check)', () => {
  assert.equal(decideStockUpdate({ seenCount: 5, inStockCount: 500, allowMass: true }).mark, true);
  assert.equal(decideStockUpdate({ seenCount: 0, inStockCount: 500, allowMass: true }).mark, false);
});

// ─── against a real (in-memory) Mongo ────────────────────────────────────────
let mongod;
before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await ShoeProduct.init();
});
after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await ShoeProduct.deleteMany({});
  delete process.env.SCRAPER_ALLOW_MASS_OOS;
});

const shoe = (brand, n, extra = {}) => ({ name: `Shoe ${n}`, brand, price: 2000, productUrl: `https://${brand}.pk/${n}`, ...extra });

test('marks only unseen in-stock rows of the same brand', async () => {
  await ShoeProduct.create([
    ...Array.from({ length: 25 }, (_, i) => shoe('Stylo', i)),
    shoe('Borjan', 1), // a different brand must be untouched
  ]);
  const seen = new Set(Array.from({ length: 20 }, (_, i) => `https://Stylo.pk/${i}`));
  const r = await markUnseenOutOfStock(ShoeProduct, 'Stylo', seen);
  assert.deepEqual({ marked: r.marked, skipped: r.skipped }, { marked: 5, skipped: false });
  assert.equal(await ShoeProduct.countDocuments({ brand: 'Stylo', inStock: false }), 5);
  assert.equal(await ShoeProduct.countDocuments({ brand: 'Borjan', inStock: { $ne: false } }), 1);
});

test('a suspicious run changes nothing', async () => {
  await ShoeProduct.create(Array.from({ length: 40 }, (_, i) => shoe('Stylo', i)));
  const seen = new Set(['https://Stylo.pk/0', 'https://Stylo.pk/1']); // 2 of 40
  const r = await markUnseenOutOfStock(ShoeProduct, 'Stylo', seen);
  assert.equal(r.skipped, true);
  assert.equal(await ShoeProduct.countDocuments({ inStock: false }), 0);
});

test('a product that comes back is not touched by the sweep (re-listing is handled by the upsert)', async () => {
  await ShoeProduct.create([shoe('Stylo', 1, { inStock: false }), shoe('Stylo', 2)]);
  const r = await markUnseenOutOfStock(ShoeProduct, 'Stylo', new Set(['https://Stylo.pk/2']));
  assert.equal(r.marked, 0); // row 1 was already out of stock; nothing newly marked
});
