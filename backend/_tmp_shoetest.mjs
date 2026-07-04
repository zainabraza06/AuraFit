import { normalizeShoeProduct } from './scripts/scrapers/parsers/shoeParser.js';
const sbc = (sub) => ({ brand: 'Stylo', category: 'shoes', subCategory: sub, occasion: ['party'], style: [], source: 't', gender: 'women' });
const cases = [
  ['Formal Sandal (title wins over wedge tag)', { title: 'Seagreen Formal Sandal For Ladies PU0751', description: 'wedge sole', tags:['wedge','formal'], variantOptions:['Seagreen'], images:['x'], productUrl:'http://s/1', price: 3000 }, sbc('heels')],
  ['Formal Slipper (title wins over heel tag)', { title: 'Pink Formal Slipper For Ladies', description: 'block heel', tags:['heel'], variantOptions:['Pink'], images:['x'], productUrl:'http://s/2', price: 2500 }, sbc('heels')],
  ['Court Shoes -> pump', { title: 'Fawn Court Shoes For Women', description: 'block heel', tags:['heel'], variantOptions:['Fawn'], images:['x'], productUrl:'http://s/3', price: 4000 }, sbc('heels')]
];
for (const [label, raw, cfg] of cases) {
  const p = normalizeShoeProduct(raw, cfg);
  console.log(label.padEnd(42), `-> shoeType=${p.shoeType} color=${p.primaryColor}/${p.primaryExactColor}`);
}
