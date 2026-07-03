import { normalizeProduct } from './scripts/scrapers/parsers/productParser.js';
const bc = (sub) => ({ brand: 'T', category: 'clothing', subCategory: sub, occasion: ['casual'], style: [], source: 't' });
const cases = [
  ['3pc unstitched title in 2-piece collection', { title: '3 PIECE PRINTED LAWN SUIT-COSMOS BLUE (UNSTITCHED)', description: 'x', tags:['Women'], variantOptions:['Blue'], images:['x'], productUrl:'http://a/1', price: 6000 }, bc('2-piece')],
  ['co-ord set (no dupatta allowed)', { title: 'Lawn Co-ord Set', description: 'Includes shirt trouser dupatta', tags:['Women'], variantOptions:['Pink'], images:['x'], productUrl:'http://a/2', price: 4000 }, bc('co-ord')],
  ['plain 2-piece', { title: 'Embroidered 2 Piece Suit', description: 'style with a dupatta', tags:['Women'], variantOptions:['Maroon'], images:['x'], productUrl:'http://a/3', price: 5000 }, bc('2-piece')],
  ['3-piece stitched', { title: 'Luxury 3 Piece Suit', description:'x', tags:['Women'], variantOptions:['Green'], images:['x'], productUrl:'http://a/4', price: 12000 }, bc('3-piece')],
  ['kurta with 1 piece title', { title: 'Printed Kurta', description:'x', tags:['Women'], variantOptions:['White'], images:['x'], productUrl:'http://a/5', price: 2500 }, bc('kurta')],
  ['unstitched title, kurta collection', { title: 'Unstitched Embroidered Shirt Fabric', description:'x', tags:['Women'], variantOptions:['Beige'], images:['x'], productUrl:'http://a/6', price: 3000 }, bc('kurta')]
];
for (const [label, raw, cfg] of cases) {
  const p = normalizeProduct(raw, cfg);
  console.log(label.padEnd(44), `-> sub=${p.subCategory} piece=${p.pieceType} stitch=${p.stitchedType} inc=[${p.pieceDetails.includes.join('+')}] total=${p.pieceDetails.totalCount} dress=${p.dressStyle}`);
}
