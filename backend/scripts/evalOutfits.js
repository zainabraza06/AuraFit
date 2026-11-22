/**
 * evalOutfits.js — does suggest_accessories (the rule-based outfit matcher) beat picking at random?
 *
 *   npm run eval:outfits                  # 80 dresses, 20 random alternatives each
 *   npm run eval:outfits -- --dresses 150
 *
 * For a sample of in-stock dresses it asks the matcher for a shoe, a jewelry set and a watch, then compares what it
 * chose with 20 random in-stock items of the same kind (same gender rules):
 *   colour harmony   getColorArrayCompatibility(dress colours, item colours): matcher's pick vs the random average
 *   win rate         share of dresses where the pick is at least as harmonious as the random average
 *   occasion fit     share of picks that share an occasion tag with the dress (vs random)
 *   validity         in stock, gender-compatible, present (these must be 100%)
 * Deterministic sample (every n-th dress by id) and seeded randomness, so the result is reproducible.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };

/** Small seeded PRNG (mulberry32) so "random" baselines are reproducible. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const colorsOf = (p) => [p.primaryColor, ...(p.colors || [])].filter(Boolean);
export const sharesOccasion = (a, b) => (a.occasion || []).some((o) => (b.occasion || []).map((x) => String(x).toLowerCase()).includes(String(o).toLowerCase()));
export const genderOk = (dress, item) => !dress.gender || !item.gender || item.gender === dress.gender || item.gender === 'unisex' || dress.gender === 'unisex';
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function main() {
  const dresses = Number(arg('dresses', 80));
  const alternatives = Number(arg('alternatives', 20));
  await mongoose.connect(process.env.MONGO_URI);
  const { runTool } = await import('../services/agent/tools.js');
  const { getColorArrayCompatibility } = await import('../services/colorTheory.js');
  const Clothing = (await import('../models/ClothingProduct.js')).default;
  const Shoe = (await import('../models/ShoeProduct.js')).default;
  const Jewelry = (await import('../models/JewelryProduct.js')).default;
  const Watch = (await import('../models/WatchProduct.js')).default;

  const rand = seeded(20261117);
  const pools = {};
  for (const [k, M] of Object.entries({ shoes: Shoe, jewelry: Jewelry, watches: Watch })) {
    pools[k] = await M.find({ inStock: { $ne: false } }, 'primaryColor colors occasion gender inStock').lean();
  }
  const all = await Clothing.find({ inStock: { $ne: false }, gender: 'women', dressStyle: { $nin: ['dupatta', 'scarf'] } }, 'primaryColor colors occasion gender name').sort({ _id: 1 }).lean();
  const step = Math.max(1, Math.floor(all.length / dresses));
  const sample = all.filter((_, i) => i % step === 0).slice(0, dresses);

  const stats = { shoe: [], jewelry: [], watch: [] };
  let invalid = 0;
  let total = 0;
  for (const dress of sample) {
    const res = await runTool('suggest_accessories', { id: String(dress._id) });
    if (res.error) { invalid++; total++; continue; }
    const picks = { shoe: res.shoe, jewelry: res.jewelry?.[0], watch: res.watch };
    const poolOf = { shoe: pools.shoes, jewelry: pools.jewelry, watch: pools.watches };
    for (const kind of ['shoe', 'jewelry', 'watch']) {
      total++;
      const pick = picks[kind];
      if (!pick) { invalid++; continue; }
      const full = poolOf[kind].find((p) => String(p._id) === String(pick.id));
      if (!full || full.inStock === false || !genderOk(dress, full)) { invalid++; continue; }
      const harmony = getColorArrayCompatibility(colorsOf(dress), colorsOf(full));
      const eligible = poolOf[kind].filter((p) => genderOk(dress, p));
      const rnd = Array.from({ length: alternatives }, () => eligible[Math.floor(rand() * eligible.length)]);
      const rndHarmony = mean(rnd.map((p) => getColorArrayCompatibility(colorsOf(dress), colorsOf(p))));
      stats[kind].push({ harmony, rndHarmony, occ: sharesOccasion(dress, full) ? 1 : 0, rndOcc: mean(rnd.map((p) => (sharesOccasion(dress, p) ? 1 : 0))) });
    }
  }

  const f = (x) => (x == null ? 'n/a' : x.toFixed(3));
  console.log(`${sample.length} dresses, ${alternatives} random alternatives per pick\n`);
  console.log('kind      n    harmony(pick)  harmony(random)  lift     win-rate   occasion(pick)  occasion(random)');
  const summary = {};
  for (const [kind, rows] of Object.entries(stats)) {
    const h = mean(rows.map((r) => r.harmony));
    const rh = mean(rows.map((r) => r.rndHarmony));
    const win = mean(rows.map((r) => (r.harmony >= r.rndHarmony ? 1 : 0)));
    const occ = mean(rows.map((r) => r.occ));
    const rocc = mean(rows.map((r) => r.rndOcc));
    summary[kind] = { n: rows.length, harmony: h, randomHarmony: rh, lift: h != null && rh ? h / rh : null, winRate: win, occasion: occ, randomOccasion: rocc };
    console.log(`${kind.padEnd(8)} ${String(rows.length).padStart(3)}   ${f(h).padStart(10)}     ${f(rh).padStart(10)}     ${f(summary[kind].lift).padStart(6)}x  ${f(win).padStart(8)}   ${f(occ).padStart(10)}      ${f(rocc).padStart(10)}`);
  }
  console.log(`\nvalidity: ${total - invalid}/${total} suggestions were present, in stock and gender-compatible`);
  fs.writeFileSync(path.resolve(__dirname, '../eval/outfits-results.json'), `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), dresses: sample.length, alternatives, validity: { ok: total - invalid, of: total }, summary }, null, 2)}\n`);
  return invalid === 0 ? 0 : 2;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); process.exit(); });
