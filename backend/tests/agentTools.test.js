import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import WatchProduct from '../models/WatchProduct.js';
import WardrobeItem from '../models/WardrobeItem.js';
import { EMBEDDING_MODEL_ID, setEmbeddingBackend } from '../services/embeddings.js';
import { clearVectorCache } from '../services/vectorCache.js';
import { TOOLS, runTool, compactProduct } from '../services/agent/tools.js';

let mongod;
let dress;
let shoe;

before(async () => {
  process.env.NODE_ENV = 'test';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setEmbeddingBackend({ embed: async (texts) => texts.map(() => [1, 0, 0]) });
  clearVectorCache();
  const base = { brand: 'TestBrand', gender: 'women', price: 5000, embedding: [1, 0, 0], embeddingModel: EMBEDDING_MODEL_ID, inStock: true };
  dress = await ClothingProduct.create({ ...base, name: 'Maroon Embroidered Lawn Suit', primaryColor: 'Red', occasion: ['eid'], productUrl: 'https://t.pk/dress' });
  await ClothingProduct.create({ ...base, name: 'Maroon Sold Out Suit', primaryColor: 'Red', inStock: false, productUrl: 'https://t.pk/gone' });
  await ClothingProduct.create({ ...base, name: 'Cheap Red Kurta', price: 900, primaryColor: 'Red', productUrl: 'https://t.pk/cheap' });
  shoe = await ShoeProduct.create({ ...base, name: 'Gold Block Heel', shoeType: 'block-heel', primaryColor: 'Gold', productUrl: 'https://t.pk/shoe' });
  await JewelryProduct.create({ ...base, name: 'Gold Jhumka', jewelryType: 'jhumka', primaryColor: 'Gold', productUrl: 'https://t.pk/jew' });
  await WatchProduct.create({ ...base, name: 'Rose Dress Watch', watchType: 'dress', primaryColor: 'Gold', productUrl: 'https://t.pk/watch' });
});

after(async () => {
  setEmbeddingBackend(null);
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('every tool is read-only and has a described zod schema', () => {
  assert.ok(TOOLS.length >= 5);
  for (const t of TOOLS) {
    assert.equal(t.readOnly, true, `${t.name} must be read-only`);
    assert.ok(t.description.length > 20, `${t.name} needs a description`);
    assert.equal(typeof t.input.safeParse, 'function');
  }
});

test('search_catalog returns compact in-stock products and honours maxPrice', async () => {
  const r = await runTool('search_catalog', { query: 'maroon embroidered lawn suit', catalog: 'clothing', limit: 5 });
  assert.equal(r.mode, 'semantic');
  const names = r.products.map((p) => p.name);
  assert.ok(names.includes('Maroon Embroidered Lawn Suit'));
  assert.ok(!names.includes('Maroon Sold Out Suit'), 'sold-out items never reach the agent');
  assert.ok(r.products.every((p) => p.id && !('embedding' in p) && !('description' in p)), 'compact: no embeddings or descriptions');

  const cheap = await runTool('search_catalog', { query: 'red kurta', catalog: 'clothing', maxPrice: 1000 });
  assert.deepEqual(cheap.products.map((p) => p.name), ['Cheap Red Kurta']);
});

test('get_product returns details; unknown id is a structured error, not an exception', async () => {
  const r = await runTool('get_product', { id: String(dress._id) });
  assert.equal(r.name, 'Maroon Embroidered Lawn Suit');
  assert.equal(r.catalog, 'clothing');
  assert.equal(r.inStock, true);
  assert.deepEqual(await runTool('get_product', { id: 'a'.repeat(24) }), { error: 'not_found' });
});

test('suggest_accessories picks a shoe, jewelry and a watch with reasons', async () => {
  const r = await runTool('suggest_accessories', { id: String(dress._id) });
  assert.equal(r.shoe.name, 'Gold Block Heel');
  assert.equal(r.jewelry[0].name, 'Gold Jhumka');
  assert.equal(r.watch.name, 'Rose Dress Watch');
  assert.ok(r.shoe.reason && r.watch.reason);
});

test('score_pair scores two products', async () => {
  const r = await runTool('score_pair', { idA: String(dress._id), idB: String(shoe._id) });
  assert.ok(r.total >= 0 && r.total <= 1);
  assert.equal(r.b, 'Gold Block Heel');
});

test('bad arguments and unknown tools return structured errors; nothing throws', async () => {
  const bad = await runTool('search_catalog', { query: 'x', limit: 99 });
  assert.equal(bad.error, 'invalid_arguments');
  assert.ok(bad.issues.length >= 1);
  assert.equal((await runTool('get_product', { id: 'not-an-id' })).error, 'invalid_arguments');
  assert.equal((await runTool('delete_everything', {})).error, 'unknown_tool');
});

test('get_wardrobe needs a signed-in user and only returns that user\'s items', async () => {
  assert.deepEqual(await runTool('get_wardrobe', {}), { error: 'not_signed_in' });
  const me = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  await WardrobeItem.create([{ user: me, name: 'Navy Kurta', category: 'clothing', primaryColor: 'Navy' }, { user: other, name: 'Secret', category: 'clothing' }]);
  const r = await runTool('get_wardrobe', {}, { userId: String(me) });
  assert.deepEqual(r.items.map((i) => i.name), ['Navy Kurta']);
});

test('compactProduct prefers the exact colour and truncates occasions', () => {
  const c = compactProduct({ _id: 'x', name: 'n', primaryColor: 'Red', primaryExactColor: 'Maroon', occasion: ['a', 'b', 'c', 'd', 'e'] }, 'clothing');
  assert.equal(c.color, 'Maroon');
  assert.equal(c.occasion.length, 4);
});

test('sloppy LLM arguments (null, empty strings, numeric strings) are accepted, not rejected as "invalid"', async () => {
  const { cleanArgs } = await import('../services/agent/tools.js');
  assert.deepEqual(cleanArgs({ query: 'x', catalog: null, gender: '', maxPrice: 'none', limit: undefined }), { query: 'x' });
  assert.deepEqual(cleanArgs(null), {});
  assert.deepEqual(cleanArgs([1]), {});
  const r = await runTool('search_catalog', { query: 'red kurta', catalog: null, gender: 'any', maxPrice: '1000', limit: '5' });
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.deepEqual(r.products.map((p) => p.name), ['Cheap Red Kurta'], 'maxPrice "1000" was coerced to a number and applied');
});
