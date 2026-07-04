import { normalizeProduct } from './scripts/scrapers/parsers/productParser.js';
const bc = (sub) => ({ brand: 'T', category: 'clothing', subCategory: sub, occasion: ['eid'], style: [], source: 't' });
const rows = [
  ['4pc unstitched', { title: '4 PIECE UNSTITCHED EMBROIDERED SUIT', description:'x', tags:['Women'], variantOptions:['Red'], images:['x'], productUrl:'http://a/1', price: 15000 }, bc('festive')],
  ['4pc stitched', { title: '4 Piece Wedding Suit', description:'x', tags:['Women'], variantOptions:['Gold'], images:['x'], productUrl:'http://a/2', price: 30000 }, bc('bridal')]
];
for (const [label, raw, cfg] of rows) {
  const p = normalizeProduct(raw, cfg);
  console.log(label.padEnd(16), '-> sub=' + p.subCategory + ' piece=' + p.pieceType + ' stitch=' + p.stitchedType + ' inc=[' + p.pieceDetails.includes.join('+') + '] total=' + p.pieceDetails.totalCount);
}
