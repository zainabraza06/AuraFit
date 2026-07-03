import dotenv from 'dotenv'; import path from 'path';
dotenv.config({ path: path.resolve('.env') });
import connectDB from './config/db.js';
import Clothing from './models/ClothingProduct.js';
import Shoe from './models/ShoeProduct.js';
await connectDB();

const PIECE_COUNT = { '1-piece': 1, '2-piece': 2, '3-piece': 3, '4-piece': 4 };

function h(t) { console.log('\n' + '═'.repeat(70) + '\n' + t + '\n' + '═'.repeat(70)); }
async function dist(Model, field) {
  return Model.aggregate([{ $group: { _id: `$${field}`, n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
}
const pct = (n, d) => d ? ((100 * n / d).toFixed(1) + '%') : '0%';

// ─── CLOTHING ───────────────────────────────────────────────────────────────
h('CLOTHING — totals');
const cTotal = await Clothing.countDocuments();
console.log('total:', cTotal);
console.log('by brand:', JSON.stringify(await dist(Clothing, 'brand')));
console.log('by gender:', JSON.stringify(await dist(Clothing, 'gender')));
console.log('by stitchedType:', JSON.stringify(await dist(Clothing, 'stitchedType')));
console.log('by pieceType:', JSON.stringify(await dist(Clothing, 'pieceType')));
console.log('by subCategory:', JSON.stringify(await dist(Clothing, 'subCategory')));
console.log('by dressStyle:', JSON.stringify(await dist(Clothing, 'dressStyle')));
console.log('by primaryColor:', JSON.stringify(await dist(Clothing, 'primaryColor')));

h('CLOTHING — anomaly checks');
const all = await Clothing.find({}, 'name brand subCategory pieceType stitchedType pieceDetails dressStyle primaryColor primaryExactColor exactColors gender').lean();
let a = { menkids: [], pieceMismatch: [], stitchMismatch: [], twoPieceHasDupatta: [], threePieceNoDupatta: [], includesCountMismatch: [], noColor: 0, unstitchedNotFabric: [], dupattaWrong: [] };
for (const p of all) {
  if (p.gender === 'men' || p.gender === 'kids') a.menkids.push(p.name);
  // pieceType vs subCategory
  const sc = p.subCategory || '';
  const expectPieces = sc === '2-piece' || sc === 'unstitched-2-piece' ? 2
    : sc === '3-piece' || sc === 'unstitched-3-piece' ? 3
    : sc === '4-piece' ? 4
    : (sc === 'kurta' || sc === 'pants' || sc === 'shalwar' || sc === 'dupatta' || sc === 'unstitched-1-piece') ? 1 : null;
  if (expectPieces && p.pieceType && PIECE_COUNT[p.pieceType] !== expectPieces) a.pieceMismatch.push(`${p.name} [${sc} -> ${p.pieceType}]`);
  // stitching vs subCategory
  if (sc.startsWith('unstitched') && p.stitchedType !== 'unstitched') a.stitchMismatch.push(`${p.name} [${sc} -> ${p.stitchedType}]`);
  if (!sc.startsWith('unstitched') && sc !== 'other' && sc !== 'festive' && p.stitchedType === 'unstitched') a.stitchMismatch.push(`${p.name} [${sc} -> unstitched]`);
  // includes sanity
  const inc = p.pieceDetails?.includes || [];
  const incStr = inc.join(',');
  if (p.pieceType === '2-piece' && (incStr.includes('dupatta'))) a.twoPieceHasDupatta.push(`${p.name} [${incStr}]`);
  if ((sc === '3-piece' || sc === 'unstitched-3-piece') && !incStr.includes('dupatta')) a.threePieceNoDupatta.push(`${p.name} [${incStr}]`);
  if (p.pieceType && PIECE_COUNT[p.pieceType] && p.pieceDetails?.totalCount && p.pieceDetails.totalCount !== PIECE_COUNT[p.pieceType]) a.includesCountMismatch.push(`${p.name} [${p.pieceType} total=${p.pieceDetails.totalCount}]`);
  if (sc.startsWith('unstitched') && inc.length && !inc.every(x => x.startsWith('fabric-'))) a.unstitchedNotFabric.push(`${p.name} [${incStr}]`);
  if (!p.primaryColor || p.primaryColor === 'Multicolor') a.noColor++;
}
const show = (label, arr, lim = 8) => console.log(`${label}: ${arr.length}` + (arr.length ? '\n   - ' + arr.slice(0, lim).join('\n   - ') : ''));
show('MEN/KIDS leakage', a.menkids);
show('pieceType != subCategory', a.pieceMismatch);
show('stitchedType != subCategory', a.stitchMismatch);
show('2-piece INCLUDES dupatta (bug)', a.twoPieceHasDupatta);
show('3-piece MISSING dupatta', a.threePieceNoDupatta);
show('totalCount != pieceType count', a.includesCountMismatch);
show('unstitched includes non-fabric token', a.unstitchedNotFabric);
console.log('Multicolor/no-color:', a.noColor, pct(a.noColor, cTotal));

h('CLOTHING — sample (2 per brand)');
const brands = (await dist(Clothing, 'brand')).map(b => b._id);
for (const b of brands) {
  const s = await Clothing.find({ brand: b }, 'name subCategory pieceType stitchedType pieceDetails dressStyle primaryColor primaryExactColor').limit(2).lean();
  for (const p of s) console.log(`[${b}] ${p.name.slice(0,45).padEnd(45)} | ${p.subCategory} | ${p.pieceType} | ${p.stitchedType} | inc=[${(p.pieceDetails?.includes||[]).join('+')}] | ${p.dressStyle} | ${p.primaryColor}/${p.primaryExactColor}`);
}

// ─── SHOES ────────────────────────────────────────────────────────────────
h('SHOES — totals');
const sTotal = await Shoe.countDocuments();
console.log('total:', sTotal);
console.log('by brand:', JSON.stringify(await dist(Shoe, 'brand')));
console.log('by gender:', JSON.stringify(await dist(Shoe, 'gender')));
console.log('by shoeType:', JSON.stringify(await dist(Shoe, 'shoeType')));
console.log('by subCategory:', JSON.stringify(await dist(Shoe, 'subCategory')));
console.log('by primaryColor:', JSON.stringify(await dist(Shoe, 'primaryColor')));

h('SHOES — anomaly checks');
const sall = await Shoe.find({}, 'name brand shoeType subCategory primaryColor primaryExactColor gender').lean();
let sMenKids = [], sOther = 0, sNoColor = 0;
for (const p of sall) {
  if (p.gender === 'men' || p.gender === 'kids') sMenKids.push(`${p.brand}:${p.name}`);
  if (!p.shoeType || p.shoeType === 'other') sOther++;
  if (!p.primaryColor || p.primaryColor === 'Multicolor') sNoColor++;
}
show('MEN/KIDS leakage', sMenKids);
console.log('shoeType=other:', sOther, pct(sOther, sTotal));
console.log('Multicolor/no-color:', sNoColor, pct(sNoColor, sTotal));
h('SHOES — sample (3 per brand)');
const sbrands = (await dist(Shoe, 'brand')).map(b => b._id);
for (const b of sbrands) {
  const s = await Shoe.find({ brand: b }, 'name shoeType subCategory primaryColor primaryExactColor gender').limit(3).lean();
  for (const p of s) console.log(`[${b}] ${p.name.slice(0,45).padEnd(45)} | ${p.shoeType} | ${p.subCategory} | ${p.primaryColor}/${p.primaryExactColor} | ${p.gender}`);
}
process.exit(0);
