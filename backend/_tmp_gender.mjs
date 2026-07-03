import { normalizeProduct } from './scripts/scrapers/parsers/productParser.js';
const bc = (sub, gender) => ({ brand: 'Limelight', category: 'clothing', subCategory: sub, occasion: ['casual'], style: [], source: 'test', gender });
const cases = [
  ['women-tagged kurta (must KEEP)', { title: 'Embroidered Kurta', description: 'Elegant piece.', tags: ['Women','Pret','Lawn'], variantOptions: ['Maroon'], images: ['x'], productUrl: 'http://a/1', price: 4000 }, bc('kurta', undefined)],
  ['other subcat sale item (no crash, totalCount)', { title: 'Printed Scarf', description: 'Accessory.', tags: ['Women','Sale'], variantOptions: ['Blue'], images: ['x'], productUrl: 'http://a/2', price: 900 }, bc('other', undefined)],
  ['explicit men kurta (drop via adapter, gender=men)', { title: 'Gents Waistcoat', description: 'For men.', tags: ['Men'], variantOptions: ['Black'], images: ['x'], productUrl: 'http://a/3', price: 5000 }, bc('kurta', undefined)]
];
for (const [label, raw, cfg] of cases) {
  const p = normalizeProduct(raw, cfg);
  if (!p) { console.log(label.padEnd(46), '-> NULL'); continue; }
  console.log(label.padEnd(46), `-> gender=${p.gender} piece=${p.pieceType} total=${p.pieceDetails.totalCount} inc=[${p.pieceDetails.includes.join(',')}]`);
}
