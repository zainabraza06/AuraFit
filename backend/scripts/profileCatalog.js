import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * profileCatalog.js — read-only data-quality profile of the live catalog.
 * Complements auditCatalog.js (field-vs-description consistency) with completeness,
 * price outliers, duplicates, bad text and vague categories, plus the worst brands.
 *
 *   npm run profile:catalog
 */
import mongoose from 'mongoose';
const base = '../models/';
const models = {
  clothing: (await import(base + 'ClothingProduct.js')).default,
  shoes: (await import(base + 'ShoeProduct.js')).default,
  jewelry: (await import(base + 'JewelryProduct.js')).default,
  watches: (await import(base + 'WatchProduct.js')).default,
};
await mongoose.connect(process.env.MONGO_URI);
const pct = (n, t) => `${n} (${t ? ((n / t) * 100).toFixed(1) : 0}%)`;
for (const [name, M] of Object.entries(models)) {
  const docs = await M.find({}).lean();
  const t = docs.length; if (!t) { console.log(`\n## ${name}: 0 docs`); continue; }
  const c = (f) => docs.filter(f).length;
  const prices = docs.map((d) => d.price).filter((p) => typeof p === 'number' && p > 0).sort((a, b) => a - b);
  const med = prices[Math.floor(prices.length / 2)];
  const key = (d) => `${d.brand}|${String(d.name).toLowerCase().trim()}`;
  const seen = new Map(); docs.forEach((d) => seen.set(key(d), (seen.get(key(d)) || 0) + 1));
  const dupNames = [...seen.values()].filter((v) => v > 1).length;
  console.log(`\n## ${name}: ${t} docs, brands=${new Set(docs.map((d) => d.brand)).size}, in stock=${pct(c((d) => d.inStock !== false), t)}`);
  console.log(`  no price/0:            ${pct(c((d) => !(d.price > 0)), t)}`);
  console.log(`  price outliers (<${Math.round(med * 0.1)} or >${med * 10}): ${pct(c((d) => d.price > 0 && (d.price < med * 0.1 || d.price > med * 10)), t)}  median=${med}`);
  console.log(`  compareAt < price:     ${pct(c((d) => d.compareAtPrice && d.compareAtPrice < d.price), t)}`);
  console.log(`  no image:              ${pct(c((d) => !(d.imageUrl || d.images?.length)), t)}`);
  console.log(`  description <40 chars: ${pct(c((d) => String(d.description || '').trim().length < 40), t)}`);
  console.log(`  HTML/entities in text: ${pct(c((d) => /<[a-z][^>]*>|&nbsp;|&amp;|&#\d+;|\u00/i.test(`${d.name} ${d.description}`)), t)}`);
  console.log(`  name ALLCAPS/odd:      ${pct(c((d) => /^[^a-z]*$/.test(String(d.name)) || /\s{2,}/.test(String(d.name))), t)}`);
  console.log(`  no colors:             ${pct(c((d) => !(d.colors?.length) && !d.primaryColor), t)}`);
  console.log(`  no sizes:              ${pct(c((d) => !(d.sizes?.length)), t)}`);
  console.log(`  no embedding:          ${pct(c((d) => !(d.embedding?.length)), t)}`);
  console.log(`  subCategory other/none:${pct(c((d) => !d.subCategory || d.subCategory === 'other'), t)}`);
  console.log(`  duplicate brand+name:  ${dupNames} groups`);
  console.log(`  no gender:             ${pct(c((d) => !d.gender), t)}`);
  const perBrand = {}; docs.forEach((d) => { const b = (perBrand[d.brand] ||= { n: 0, noimg: 0, nodesc: 0, noprice: 0, other: 0 }); b.n++; if (!(d.imageUrl || d.images?.length)) b.noimg++; if (String(d.description || '').trim().length < 40) b.nodesc++; if (!(d.price > 0)) b.noprice++; if (!d.subCategory || d.subCategory === 'other') b.other++; });
  const worst = Object.entries(perBrand).map(([b, v]) => ({ b, ...v, bad: v.noimg + v.nodesc + v.noprice + v.other })).sort((a, b) => b.bad / b.n - a.bad / a.n).slice(0, 5);
  console.log('  worst brands (n, noImg, shortDesc, noPrice, otherCat):'); worst.forEach((w) => console.log(`    ${w.b}: ${w.n}, ${w.noimg}, ${w.nodesc}, ${w.noprice}, ${w.other}`));
}
await mongoose.disconnect();
