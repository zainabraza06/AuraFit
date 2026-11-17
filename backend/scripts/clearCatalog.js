/**
 * clearCatalog.js — wipe the PRODUCT catalog for a clean reload, keeping everything users own.
 *
 *   npm run clear:catalog                       # dry run: shows what would go and what is kept
 *   npm run clear:catalog -- --yes              # actually delete (needs a backup from the last 60 min)
 *   npm run clear:catalog -- --yes --include-legacy   # also drop the unused legacy `products` collection
 *   npm run clear:catalog -- --relink           # after re-scraping: re-attach saved favorites by productUrl
 *
 * Cleared:  clothingproducts, shoeproducts, jewelryproducts, watchproducts, scraperlogs (+ legacy `products`)
 * Kept:     users, wardrobeitems, outfits, systemlogs
 * Favorites point at product _ids that disappear, so they are first saved as
 * {user, productKind, productUrl} in exports/favorites-remap.json, removed, and
 * re-created by --relink once the catalog is back.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const CATALOG_COLLECTIONS = ['clothingproducts', 'shoeproducts', 'jewelryproducts', 'watchproducts', 'scraperlogs'];
export const KEPT_COLLECTIONS = ['users', 'wardrobeitems', 'outfits', 'systemlogs'];
const KIND_TO_COLLECTION = {
  ClothingProduct: 'clothingproducts',
  ShoeProduct: 'shoeproducts',
  JewelryProduct: 'jewelryproducts',
  WatchProduct: 'watchproducts',
};
const REMAP_FILE = path.resolve(__dirname, '../exports/favorites-remap.json');

/** Newest backup-* folder age in minutes, or Infinity if none. */
export function newestBackupAgeMinutes(root = path.resolve(__dirname, '../exports')) {
  if (!fs.existsSync(root)) return Infinity;
  const ages = fs
    .readdirSync(root)
    .filter((n) => n.startsWith('backup-') && fs.existsSync(path.join(root, n, '_summary.json')))
    .map((n) => (Date.now() - fs.statSync(path.join(root, n, '_summary.json')).mtimeMs) / 60000);
  return ages.length ? Math.min(...ages) : Infinity;
}

/** Resolve each favorite to {user, productKind, productUrl} so it survives a reload. */
export async function snapshotFavorites(db) {
  const out = [];
  for (const fav of await db.collection('favorites').find({}).toArray()) {
    const col = KIND_TO_COLLECTION[fav.productKind];
    const product = col ? await db.collection(col).findOne({ _id: fav.product }, { projection: { productUrl: 1 } }) : null;
    if (product?.productUrl) {
      out.push({ user: String(fav.user), productKind: fav.productKind, productUrl: product.productUrl, createdAt: fav.createdAt });
    }
  }
  return out;
}

export async function clearCatalog(
  db,
  { apply = false, includeLegacy = false, maxBackupAgeMin = 60, backupRoot, remapFile = REMAP_FILE, log = console.log } = {}
) {
  const targets = [...CATALOG_COLLECTIONS, ...(includeLegacy ? ['products'] : [])];
  const counts = {};
  for (const name of [...targets, 'favorites', ...KEPT_COLLECTIONS]) counts[name] = await db.collection(name).countDocuments();

  log(`Database: ${db.databaseName}`);
  log('WILL DELETE : ' + targets.map((t) => `${t}(${counts[t]})`).join(', '));
  log('WILL KEEP   : ' + KEPT_COLLECTIONS.map((t) => `${t}(${counts[t]})`).join(', '));
  log(`FAVORITES   : ${counts.favorites} saved for re-linking, then removed`);
  if (!apply) {
    log('\nDry run: nothing changed. Re-run with --yes to apply.');
    return { applied: false, counts };
  }

  const age = newestBackupAgeMinutes(backupRoot);
  if (age > maxBackupAgeMin) {
    throw new Error(
      `Refusing to delete: no backup from the last ${maxBackupAgeMin} min (newest: ${Number.isFinite(age) ? Math.round(age) + ' min' : 'none'}). Run npm run backup:db first.`
    );
  }

  const favorites = await snapshotFavorites(db);
  if (favorites.length !== counts.favorites) {
    log(`Note: ${counts.favorites - favorites.length} favorite(s) pointed at missing products and cannot be restored.`);
  }
  fs.mkdirSync(path.dirname(remapFile), { recursive: true });
  fs.writeFileSync(remapFile, JSON.stringify(favorites, null, 2));

  for (const t of targets) {
    const r = await db.collection(t).deleteMany({});
    log(`deleted ${r.deletedCount} from ${t}`);
  }
  await db.collection('favorites').deleteMany({});
  return { applied: true, counts, savedFavorites: favorites.length };
}

/** Re-create favorites from the saved snapshot once products exist again. */
export async function relinkFavorites(db, { remapFile = REMAP_FILE, log = console.log } = {}) {
  if (!fs.existsSync(remapFile)) {
    log('No favorites snapshot to relink.');
    return { restored: 0, missing: 0 };
  }
  let restored = 0;
  let missing = 0;
  for (const f of JSON.parse(fs.readFileSync(remapFile, 'utf8'))) {
    const col = KIND_TO_COLLECTION[f.productKind];
    const product = col ? await db.collection(col).findOne({ productUrl: f.productUrl }, { projection: { _id: 1 } }) : null;
    if (!product) {
      missing++;
      continue;
    }
    const user = new mongoose.Types.ObjectId(f.user);
    await db.collection('favorites').updateOne(
      { user, product: product._id },
      { $setOnInsert: { user, product: product._id, productKind: f.productKind, createdAt: new Date(f.createdAt), updatedAt: new Date(), __v: 0 } },
      { upsert: true }
    );
    restored++;
  }
  log(`Favorites restored: ${restored}, no longer in catalog: ${missing}`);
  return { restored, missing };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const flag = (f) => process.argv.includes(f);
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() =>
      flag('--relink')
        ? relinkFavorites(mongoose.connection.db)
        : clearCatalog(mongoose.connection.db, { apply: flag('--yes'), includeLegacy: flag('--include-legacy') })
    )
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
