import { inferColors } from './scripts/scrapers/utils/colorInference.js';
import { normalizeProduct } from './scripts/scrapers/parsers/productParser.js';
import { normalizeShoeProduct } from './scripts/scrapers/parsers/shoeParser.js';

const line = (s) => console.log(s);

line('=== COLOR ===');
const colorCases = [
  { title: 'Burgundy Embroidered Kurta', options: 'Burgundy', desc: 'A deep tone that pairs well with maroon accessories' },
  { title: 'Maroon Lawn 3 Piece', options: 'Maroon', desc: '' },
  { title: 'Beige Cotton Kurti', options: 'Beige', desc: 'natural linen blend' },
  { title: 'Floral Printed Shirt', options: '', desc: 'multi floral print' },
  { title: 'Navy Blue Trouser', options: 'Navy Blue', desc: '' },
  { title: 'Embroidered Shirt', options: 'Off White', desc: 'ivory base with red thread work' }
];
for (const c of colorCases) {
  const r = inferColors({ options: c.options, title: c.title, tags: '', description: c.desc });
  line(`${c.title.padEnd(34)} -> family=${r.primaryColor}  exact=${r.primaryExactColor}  colors=${r.colors.join(',')}`);
}

line('\n=== CLOTHING NORMALIZE ===');
const bc = (sub, occ = [], sty = [], gender) => ({ brand: 'TestBrand', category: 'clothing', subCategory: sub, occasion: occ, style: sty, source: 'test', gender });
const clothCases = [
  ['2-piece item w/ stray dupatta mention', { title: 'Maroon 2 Piece Suit', description: 'Shirt & Trouser. Style it with your favourite dupatta.', variantOptions: ['Maroon'], images: ['x'], productUrl: 'http://a/1', price: 5000 }, bc('2-piece', ['casual'])],
  ['3-piece unstitched', { title: 'Blue Embroidered Lawn', description: 'Unstitched three piece.', variantOptions: ['Blue'], images: ['x'], productUrl: 'http://a/2', price: 8000 }, bc('unstitched-3-piece', ['eid'])],
  ['kurta w/ 1 piece', { title: 'Green Pret Kurta', description: 'Ready to wear kurta.', variantOptions: ['Green'], images: ['x'], productUrl: 'http://a/3', price: 3000 }, bc('kurta', ['casual'])],
  ['festive ambiguous (text says 3 piece)', { title: 'Gold Festive 3 Piece', description: '3 piece stitched.', variantOptions: ['Gold'], images: ['x'], productUrl: 'http://a/4', price: 15000 }, bc('festive', ['eid'])],
  ['dupatta only', { title: 'Printed Chiffon Dupatta', description: 'Single dupatta.', variantOptions: ['Pink'], images: ['x'], productUrl: 'http://a/5', price: 1500 }, bc('dupatta', ['party'])],
  ['pants', { title: 'Black Cigarette Trouser', description: 'Bottoms.', variantOptions: ['Black'], images: ['x'], productUrl: 'http://a/6', price: 2000 }, bc('pants', ['office'])],
  ['MEN item (should drop)', { title: 'Mens Kurta', description: 'For men.', variantOptions: ['White'], images: ['x'], productUrl: 'http://a/7', price: 3000 }, bc('kurta', ['eid'], [], 'men')]
];
for (const [label, raw, cfg] of clothCases) {
  const p = normalizeProduct(raw, cfg);
  if (!p) { line(`${label.padEnd(40)} -> DROPPED (null)`); continue; }
  line(`${label.padEnd(40)} -> stitched=${p.stitchedType} piece=${p.pieceType} includes=[${p.pieceDetails.includes.join(',')}] total=${p.pieceDetails.totalCount} dress=${p.dressStyle} color=${p.primaryColor}/${p.primaryExactColor} gender=${p.gender}`);
}

line('\n=== SHOE NORMALIZE ===');
const sbc = (sub, gender = 'women') => ({ brand: 'Stylo', category: 'shoes', subCategory: sub, occasion: ['party'], style: ['elegant'], source: 'test', gender });
const shoeCases = [
  ['women heel burgundy', { title: 'Burgundy Block Heel', description: 'Elegant heel.', variantOptions: ['Burgundy'], images: ['x'], productUrl: 'http://s/1', price: 4000 }, sbc('heels')],
  ['women khussa', { title: 'Golden Embroidered Khussa', description: '', variantOptions: ['Gold'], images: ['x'], productUrl: 'http://s/2', price: 3000 }, sbc('khussa')],
  ['men shoe (drop)', { title: 'Mens Formal Oxford', description: 'For gents.', variantOptions: ['Black'], images: ['x'], productUrl: 'http://s/3', price: 6000 }, sbc('formal', 'men')]
];
for (const [label, raw, cfg] of shoeCases) {
  const p = normalizeShoeProduct(raw, cfg);
  if (!p) { line(`${label.padEnd(24)} -> DROPPED (null)`); continue; }
  line(`${label.padEnd(24)} -> shoeType=${p.shoeType} color=${p.primaryColor}/${p.primaryExactColor} gender=${p.gender}`);
}
