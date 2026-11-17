/**
 * backupCollections.js — read-only export of every collection to JSON files.
 *
 *   npm run backup:db              # writes exports/backup-<timestamp>/<collection>.json
 *
 * Run this BEFORE any destructive operation (clearCatalog, scrape:fresh).
 * Embeddings are included so a restore does not need re-embedding.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export async function backupAll(outRoot = path.resolve(__dirname, '../exports')) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(outRoot, `backup-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const db = mongoose.connection.db;
  const summary = {};
  for (const { name } of await db.listCollections().toArray()) {
    // Stream with a cursor so a large collection never has to fit in memory twice
    const file = path.join(dir, `${name}.json`);
    const fd = fs.openSync(file, 'w');
    fs.writeSync(fd, '[');
    let n = 0;
    for await (const doc of db.collection(name).find({})) {
      fs.writeSync(fd, (n ? ',\n' : '\n') + JSON.stringify(doc));
      n++;
    }
    fs.writeSync(fd, '\n]\n');
    fs.closeSync(fd);
    summary[name] = n;
  }
  fs.writeFileSync(path.join(dir, '_summary.json'), JSON.stringify({ database: db.databaseName, at: new Date().toISOString(), counts: summary }, null, 2));
  return { dir, summary };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => backupAll())
    .then(({ dir, summary }) => { console.log(`Backup written to ${dir}`); console.table(summary); })
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}
