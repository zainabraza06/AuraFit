/**
 * exportCatalog.js
 * Dumps the full clothing + shoe catalog (all meaningful fields INCLUDING the
 * source description) to JSON and CSV under backend/exports/, for external QA
 * (e.g. handing the JSON to Claude to flag field-vs-description inconsistencies).
 *
 * Embedding vectors are excluded (noise). Usage:  node scripts/exportCatalog.js
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import connectDB from '../config/db.js';
import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';

const OUT_DIR = path.resolve(__dirname, '../exports');

const CLOTHING_FIELDS = [
  'brand', 'name', 'description', 'category', 'subCategory', 'pieceType',
  'pieceDetails', 'stitchedType', 'dressStyle', 'fashionType', 'gender',
  'occasion', 'season', 'fabric', 'pattern',
  'primaryColor', 'colors', 'primaryExactColor', 'exactColors', 'colorFamily',
  'sleeveType', 'neckline', 'fitType', 'sizes', 'priceRange', 'trendTags',
  'style', 'tags', 'price', 'currency', 'productUrl', 'imageUrl'
];

const SHOE_FIELDS = [
  'brand', 'name', 'description', 'category', 'shoeType', 'subCategory',
  'closure', 'heelHeight', 'gender', 'occasion', 'season', 'sportUse',
  'primaryColor', 'colors', 'primaryExactColor', 'exactColors', 'colorFamily',
  'sizes', 'style', 'tags', 'price', 'currency', 'productUrl', 'imageUrl'
];

function pick(doc, fields) {
  const o = {};
  for (const f of fields) {
    let v = doc[f];
    if (v === undefined) continue;
    if (f === 'pieceDetails' && v) v = { includes: v.includes || [], totalCount: v.totalCount };
    o[f] = v;
  }
  return o;
}

// ── CSV helpers (flatten arrays/objects to readable cells) ──
function toCell(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(toCell).join(' | ');
  if (typeof v === 'object') {
    if ('includes' in v) return `${(v.includes || []).join('+')} (${v.totalCount ?? ''})`;
    return JSON.stringify(v);
  }
  return String(v).replace(/\r?\n/g, ' ').trim();
}
function toCsv(rows, fields) {
  const esc = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = fields.join(',');
  const body = rows.map((r) => fields.map((f) => esc(toCell(r[f]))).join(',')).join('\n');
  return head + '\n' + body;
}

async function run() {
  await connectDB();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const clothing = (await ClothingProduct.find({}).select('-embedding -__v').lean())
    .map((d) => pick(d, CLOTHING_FIELDS));
  const shoes = (await ShoeProduct.find({}).select('-embedding -__v').lean())
    .map((d) => pick(d, SHOE_FIELDS));

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const meta = { exportedAt: new Date().toISOString(), clothingCount: clothing.length, shoeCount: shoes.length };

  const combined = { meta, clothing, shoes };
  const jsonPath = path.join(OUT_DIR, `catalog-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(combined, null, 2));

  const clothingCsv = path.join(OUT_DIR, `clothing-${stamp}.csv`);
  const shoesCsv = path.join(OUT_DIR, `shoes-${stamp}.csv`);
  fs.writeFileSync(clothingCsv, toCsv(clothing, CLOTHING_FIELDS));
  fs.writeFileSync(shoesCsv, toCsv(shoes, SHOE_FIELDS));

  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
  console.log('Export complete:');
  console.log(`  ${jsonPath}  (${kb(jsonPath)})  — ${clothing.length} clothing + ${shoes.length} shoes`);
  console.log(`  ${clothingCsv}  (${kb(clothingCsv)})`);
  console.log(`  ${shoesCsv}  (${kb(shoesCsv)})`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
