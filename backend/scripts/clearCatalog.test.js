import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { clearCatalog, relinkFavorites } from './clearCatalog.js';

let mongod;
let db;
let tmp;
let remap;
const quiet = () => {};
const u1 = new mongoose.Types.ObjectId();

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  db = mongoose.connection.db;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clr-'));
  remap = path.join(tmp, 'favorites-remap.json');
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function seed() {
  for (const c of ['clothingproducts', 'shoeproducts', 'scraperlogs', 'products', 'users', 'wardrobeitems', 'outfits', 'systemlogs', 'favorites']) {
    await db.collection(c).deleteMany({});
  }
  const { insertedId: p1 } = await db.collection('clothingproducts').insertOne({ name: 'A', productUrl: 'https://x/a' });
  await db.collection('clothingproducts').insertOne({ name: 'B', productUrl: 'https://x/b' });
  await db.collection('shoeproducts').insertOne({ name: 'S', productUrl: 'https://x/s' });
  await db.collection('scraperlogs').insertOne({ runId: 'r' });
  await db.collection('products').insertOne({ legacy: true });
  await db.collection('users').insertOne({ _id: u1, email: 'u@x.com' });
  await db.collection('systemlogs').insertOne({ m: 1 });
  await db.collection('favorites').insertOne({ user: u1, productKind: 'ClothingProduct', product: p1, createdAt: new Date() });
}

function fakeBackup(name) {
  fs.mkdirSync(path.join(tmp, name), { recursive: true });
  fs.writeFileSync(path.join(tmp, name, '_summary.json'), '{}');
}

test('dry run changes nothing', async () => {
  await seed();
  const r = await clearCatalog(db, { apply: false, log: quiet });
  assert.equal(r.applied, false);
  assert.equal(await db.collection('clothingproducts').countDocuments(), 2);
});

test('refuses to delete without a recent backup', async () => {
  await seed();
  await assert.rejects(clearCatalog(db, { apply: true, backupRoot: tmp, remapFile: remap, log: quiet }), /no backup/);
  assert.equal(await db.collection('clothingproducts').countDocuments(), 2);
});

test('deletes catalog and favorites but keeps users and logs; favorites relink by productUrl after a reload', async () => {
  await seed();
  fakeBackup('backup-now');

  const r = await clearCatalog(db, { apply: true, includeLegacy: true, backupRoot: tmp, remapFile: remap, log: quiet });
  assert.equal(r.savedFavorites, 1);
  for (const c of ['clothingproducts', 'shoeproducts', 'scraperlogs', 'products', 'favorites']) {
    assert.equal(await db.collection(c).countDocuments(), 0, c);
  }
  assert.equal(await db.collection('users').countDocuments(), 1, 'users must survive');
  assert.equal(await db.collection('systemlogs').countDocuments(), 1);

  // reload: the same product comes back with a NEW _id
  const { insertedId } = await db.collection('clothingproducts').insertOne({ name: 'A', productUrl: 'https://x/a' });
  const rel = await relinkFavorites(db, { remapFile: remap, log: quiet });
  assert.deepEqual(rel, { restored: 1, missing: 0 });
  const fav = await db.collection('favorites').findOne({});
  assert.equal(String(fav.product), String(insertedId));
  assert.equal(String(fav.user), String(u1));
});

test('legacy collection is only dropped when asked', async () => {
  await seed();
  fakeBackup('backup-now2');
  await clearCatalog(db, { apply: true, backupRoot: tmp, remapFile: remap, log: quiet });
  assert.equal(await db.collection('products').countDocuments(), 1);
});
