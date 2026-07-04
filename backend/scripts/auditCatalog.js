/**
 * auditCatalog.js — post-extraction QA pass.
 *
 * Cross-checks each stored product's structured fields against the raw
 * `description`/`name` text to catch scraper extraction bugs, and writes a CSV of
 * findings. Ported from an external Python consistency checker and adapted to our
 * schema + shared color vocabulary, with the known false-positive sources filtered
 * out (print-style "colors", variant-option colors, token-overlap fabric match,
 * structured piece phrases only).
 *
 * Usage:
 *   node scripts/auditCatalog.js                 # audit the live DB
 *   node scripts/auditCatalog.js exports/x. json  # audit an exported catalog JSON
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { SHADE_ENTRIES, COLOR_ALIASES } from '../constants/colorVocabulary.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
// Print/embellishment words that appear after "Color:" but are NOT colors.
const NON_COLOR_LABEL = new Set(['printed', 'digital', 'embroidered', 'plain', 'solid', 'self', 'dyed', 'print']);

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4 };

/** Value(s) after a "Label:" up to the next known label. */
function labeled(desc, label) {
  const re = new RegExp(
    `${label}\\s*:\\s*([a-z0-9 /-]+?)\\s*(?=(?:[a-z][a-z]*\\s*:)|$|\\.|what you|fit:|model|design:|shirt:|trouser:|dupatta:|shawl:|slip:|weight|material|care|season|occasion|details|cut:)`,
    'gi'
  );
  const out = [];
  let m;
  while ((m = re.exec(desc.toLowerCase()))) if (m[1].trim()) out.push(m[1].trim());
  return out;
}

/** Family of a color phrase via the shared vocabulary, or null. */
function familyOf(phrase) {
  const key = norm(phrase);
  for (const [alias, fam] of Object.entries(COLOR_ALIASES)) if (norm(alias) === key) return fam;
  for (const { family, regex } of SHADE_ENTRIES) if (regex.test(phrase.toLowerCase())) return family;
  return null;
}

/** Structured piece count from text ("Unstitched 2-Piece", "2 Pc Outfit", "3 Piece Suit"), else null. */
function structuredPieces(text) {
  const t = text.toLowerCase();
  let m =
    t.match(/\bunstitched\s+([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\b/) ||
    t.match(/\b([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\s+(?:outfit|suit|stitched|unstitched)\b/) ||
    t.match(/\b([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\b/); // title bare count (titles are clean)
  if (m) return Number(m[1]);
  m = t.match(/\b(one|two|three|four)[\s-]piece\b/);
  return m ? WORD_NUM[m[1]] : null;
}

function checkClothing(p, idx) {
  const name = p.name || '';
  const desc = p.description || '';
  const text = `${name} ${desc}`.toLowerCase();
  const issues = [];

  // 1. FABRIC — field vs "Fabric:" label, using token overlap (not raw substring).
  const fabricField = (p.fabric || '').trim();
  const fabricLabels = labeled(desc, 'fabric');
  if (fabricField && fabricLabels.length) {
    const fieldTok = new Set(tokens(fabricField));
    const overlap = fabricLabels.some((fl) => {
      const lt = tokens(fl);
      return lt.some((t) => fieldTok.has(t)) || norm(fl).includes(norm(fabricField)) || norm(fabricField).includes(norm(fl));
    });
    if (!overlap) issues.push(`FABRIC: field='${fabricField}' vs label ${JSON.stringify(fabricLabels)}`);
  }

  // 2. PIECE_COUNT — only against a STRUCTURED piece phrase (skip bare "N PC" breakdowns).
  const total = p.pieceDetails?.totalCount;
  const structured = structuredPieces(name) || structuredPieces(desc.slice(0, 120));
  if (structured && total && structured !== total) {
    issues.push(`PIECE_COUNT: totalCount=${total} vs text ${structured}-piece`);
  }

  // 3. STITCHED_TYPE — 'unstitched'/'rts' vs field.
  if ((/\bunstitched\b/.test(text) || /\brts\b/.test(name.toLowerCase())) && p.stitchedType === 'stitched') {
    issues.push(`STITCHED_TYPE: field='stitched' but text says unstitched`);
  }

  // 4. GENDER — men's-only vs women (women-only catalog).
  if (p.gender === 'women' && /\bmen'?s\b/.test(text) && !/\bwomen/.test(text)) {
    issues.push(`GENDER: field='women' but text says men's`);
  }

  // 5. COLOR — last "Color:" label family vs stored family (skip print-style words).
  const colorLabels = labeled(desc, 'colou?r');
  if (colorLabels.length) {
    const last = colorLabels[colorLabels.length - 1];
    const isPrintWord = tokens(last).every((t) => NON_COLOR_LABEL.has(t));
    const fam = familyOf(last);
    if (!isPrintWord && fam && fam !== 'Multicolor') {
      const fams = (p.colors || []).concat(p.primaryColor || []);
      if (!fams.includes(fam)) issues.push(`COLOR: label='${last}'(${fam}) vs field=${p.primaryColor}`);
    }
  }

  return issues.length ? { section: 'clothing', idx, ...p, issues } : null;
}

function checkShoe(p, idx) {
  // Mirror the parser: name + CLEAN (digit-free) tags. Tags with digits are
  // merchandising codes ("B20-Girl B") whose gender words are meaningless, so
  // they must not be flagged.
  const name = (p.name || '').toLowerCase();
  const cleanTags = (p.tags || [])
    .filter((t) => !/\d/.test(t) && !/size|chart|guide|care|wash|dhldes|desc/i.test(t))
    .join(' ').toLowerCase();
  const signal = `${name} ${cleanTags}`;
  const women = /\b(women|womens|ladies)\b/.test(signal);
  const issues = [];
  if (p.gender === 'women' && /\b(men|mens|men's|gents)\b/.test(signal) && !women) {
    issues.push(`GENDER: field='women' but name/tags say men's`);
  }
  if (p.gender === 'women' && /\b(girls?|boys?|kids?|child|junior|toddler)\b/.test(signal) && !women) {
    issues.push(`GENDER: field='women' but name/tags say kids`);
  }
  return issues.length ? { section: 'shoes', idx, ...p, issues } : null;
}

async function load() {
  const arg = process.argv[2];
  if (arg) {
    const data = JSON.parse(fs.readFileSync(path.resolve(arg), 'utf8'));
    return { clothing: data.clothing || [], shoes: data.shoes || [], label: path.basename(arg) };
  }
  const connectDB = (await import('../config/db.js')).default;
  const Clothing = (await import('../models/ClothingProduct.js')).default;
  const Shoe = (await import('../models/ShoeProduct.js')).default;
  await connectDB();
  return {
    clothing: await Clothing.find({}).lean(),
    shoes: await Shoe.find({}).lean(),
    label: 'live-db'
  };
}

async function main() {
  const { clothing, shoes, label } = await load();
  const issues = [];
  clothing.forEach((p, i) => { const r = checkClothing(p, i); if (r) issues.push(r); });
  shoes.forEach((p, i) => { const r = checkShoe(p, i); if (r) issues.push(r); });

  const counts = {};
  for (const it of issues) for (const m of it.issues) counts[m.split(':')[0]] = (counts[m.split(':')[0]] || 0) + 1;

  console.log(`Audited ${clothing.length} clothing + ${shoes.length} shoes (${label})`);
  console.log(`Flagged rows: ${issues.length}`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  const outDir = path.resolve(__dirname, '../exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const outPath = path.join(outDir, `audit-${stamp}.csv`);
  const esc = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s ?? ''));
  const rows = [['section', 'brand', 'name', 'issue', 'fabric', 'stitchedType', 'pieceType', 'totalCount', 'primaryColor', 'exactColors', 'productUrl', 'description']];
  for (const it of issues) for (const m of it.issues) {
    rows.push([it.section, it.brand, it.name, m, it.fabric, it.stitchedType, it.pieceType, it.pieceDetails?.totalCount, it.primaryColor, (it.exactColors || []).join('|'), it.productUrl, (it.description || '').slice(0, 300)]);
  }
  fs.writeFileSync(outPath, rows.map((r) => r.map(esc).join(',')).join('\n'));
  console.log(`Detailed CSV: ${outPath}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
