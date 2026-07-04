import { normalizeProduct } from './scripts/scrapers/parsers/productParser.js';
const bc = (sub) => ({ brand: 'T', category: 'clothing', subCategory: sub, occasion: ['casual'], style: [], source: 't' });
const cases = [
  ['2 PIECE SUIT in kurta collection', { title: '2 PIECE BASIC JACQUARD SUIT (PRET)', description:'x', tags:['Women'], variantOptions:['Blue'], images:['x'], productUrl:'http://a/1', price: 5000 }, bc('kurta')],
  ['3 PIECE SUIT in kurta collection', { title: '3 PIECE EMBROIDERED LAWN SUIT (HIGH CASUAL)', description:'x', tags:['Women'], variantOptions:['Red'], images:['x'], productUrl:'http://a/2', price: 8000 }, bc('kurta')],
  ['2 PIECE UNSTITCHED in pants collection', { title: '2 PIECE EMBROIDERED LAWN SUIT-PERENNIAL FEST (UNSTITCHED)', description:'x', tags:['Women'], variantOptions:['Green'], images:['x'], productUrl:'http://a/3', price: 6000 }, bc('pants')],
  ['plain kurta (no count)', { title: 'Lawn Kurti (Pret)', description:'x', tags:['Women'], variantOptions:['Blue'], images:['x'], productUrl:'http://a/4', price: 3000 }, bc('kurta')],
  ['real pants', { title: 'Cigarette Trouser', description:'x', tags:['Women'], variantOptions:['Black'], images:['x'], productUrl:'http://a/5', price: 2000 }, bc('pants')]
];
for (const [label, raw, cfg] of cases) {
  const p = normalizeProduct(raw, cfg);
  console.log(label.padEnd(40), `-> sub=${p.subCategory} piece=${p.pieceType} stitch=${p.stitchedType} inc=[${p.pieceDetails.includes.join('+')}] total=${p.pieceDetails.totalCount}`);
}
