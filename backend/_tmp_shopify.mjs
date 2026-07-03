import { mapShopifyProduct } from './scripts/scrapers/extractors/shopifyExtractor.js';
import { normalizeProduct } from './scripts/scrapers/parsers/productParser.js';

const raw = {
  id: 987654321, title: 'Printed Lawn Shirt', handle: 'printed-lawn-shirt',
  vendor: 'Alkaram Studio', product_type: 'Unstitched',
  body_html: 'Digital printed lawn shirt with dyed trouser and chiffon dupatta.',
  tags: ['Summer','Lawn','Printed','Women'],
  options: [{ name: 'Size', values: ['Default Title'] }],
  variants: [{ id: 111111, title: 'Default Title', sku: 'SS-24-001', price: '5490.00', available: true }],
  images: [{ src: 'https://cdn.example/img.jpg' }]
};

const cfg = { brand: 'Alkaram Studio', category: 'clothing', subCategory: 'unstitched-3-piece',
  occasion: ['casual','summer'], style: ['printed'], source: 'AlkaramAdapter', gender: undefined };

const mapped = mapShopifyProduct(raw, 'https://www.alkaramstudio.com');
const p = normalizeProduct(mapped, cfg);
const keys = ['name','gender','subCategory','stitchedType','pieceType','pieceDetails','dressStyle',
  'fabric','pattern','season','primaryColor','primaryExactColor','colors','sizes','normalizedSizes','occasion','price'];
for (const k of keys) console.log(k.padEnd(16), '=', JSON.stringify(p[k]));
