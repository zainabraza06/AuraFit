import dotenv from 'dotenv'; import path from 'path';
dotenv.config({ path: path.resolve('.env') });
import connectDB from './config/db.js';
import Clothing from './models/ClothingProduct.js';
import Shoe from './models/ShoeProduct.js';
await connectDB();

const present = (v) => {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
};
const pctS = (n, d) => (d ? (100 * n / d).toFixed(1).padStart(5) + '%' : '  n/a');

function coverage(rows, fields, label, expectedAlways) {
  console.log('\n' + '═'.repeat(72) + '\n' + label + ` (n=${rows.length})\n` + '═'.repeat(72));
  for (const f of fields) {
    let n = 0;
    for (const r of rows) {
      const v = f.split('.').reduce((o, k) => (o == null ? o : o[k]), r);
      if (present(v)) n++;
    }
    const flag = expectedAlways.includes(f) && n < rows.length ? '  <-- EXPECTED ALWAYS' : '';
    console.log(`  ${f.padEnd(20)} ${pctS(n, rows.length)}${flag}`);
  }
}

// Enum validity — verify stored values fall inside the schema-allowed set.
function enumCheck(rows, field, allowed) {
  const bad = {};
  for (const r of rows) {
    const v = r[field];
    if (v == null || v === '') continue;
    const vals = Array.isArray(v) ? v : [v];
    for (const x of vals) if (!allowed.includes(x)) bad[x] = (bad[x] || 0) + 1;
  }
  const keys = Object.keys(bad);
  console.log(`  enum ${field.padEnd(16)} ${keys.length ? 'INVALID: ' + JSON.stringify(bad) : 'all valid'}`);
}

const clothing = await Clothing.find({}).lean();
const shoes = await Shoe.find({}).lean();

coverage(clothing,
  ['name','brand','price','productUrl','imageUrl','images','description',
   'subCategory','pieceType','pieceDetails.totalCount','pieceDetails.includes','stitchedType',
   'dressStyle','fashionType','gender','occasion','season','fabric','pattern',
   'colors','primaryColor','exactColors','primaryExactColor','colorFamily',
   'sizes','normalizedSizes','priceRange','trendTags','style',
   'sleeveType','neckline','fitType','tags'],
  'CLOTHING FIELD COVERAGE',
  ['name','brand','price','productUrl','imageUrl','images','subCategory','stitchedType',
   'gender','primaryColor','colorFamily','priceRange','pattern']);

console.log('\nCLOTHING enum validity:');
enumCheck(clothing, 'stitchedType', ['stitched','unstitched','semi-stitched']);
enumCheck(clothing, 'pieceType', ['1-piece','2-piece','3-piece','4-piece']);
enumCheck(clothing, 'gender', ['women','men','kids','unisex']);
enumCheck(clothing, 'pattern', ['plain','printed','embroidered','digital-print','floral','geometric','textured','embellished','mixed']);
enumCheck(clothing, 'colorFamily', ['red','blue','green','yellow','pink','purple','orange','neutral','earth','teal','multicolor']);
enumCheck(clothing, 'fashionType', ['eastern','western','fusion']);
enumCheck(clothing, 'primaryColor', ['Black','White','Grey','Red','Pink','Purple','Blue','Green','Teal','Yellow','Orange','Gold','Beige','Brown','Multicolor']);

// Concrete-color rate (non-Multicolor)
const concrete = clothing.filter(p => p.primaryColor && p.primaryColor !== 'Multicolor').length;
console.log(`\n  concrete color (non-Multicolor): ${pctS(concrete, clothing.length)}`);

coverage(shoes,
  ['name','brand','price','productUrl','imageUrl','images','description',
   'shoeType','subCategory','closure','heelHeight','gender','occasion','season',
   'colors','primaryColor','exactColors','primaryExactColor','colorFamily','sizes','style','tags'],
  'SHOE FIELD COVERAGE',
  ['name','brand','price','productUrl','imageUrl','images','shoeType','gender','primaryColor','colorFamily']);

console.log('\nSHOE enum validity:');
enumCheck(shoes, 'shoeType', ['khussa','kohati','kolhapuri','peshawari','heel','pump','stiletto','block-heel','wedge','platform','flat','ballet-flat','loafer','moccasin','oxford','monk-strap','sandal','chappal','slide','flip-flop','slipper','mule','sneaker','trainer','jogger','running','basketball','boot','ankle-boot','chelsea-boot','long-boot','combat','court-shoe','formal-dress','bridal-footwear','school-shoe','comfort','espadrille','boat-shoe','clogs','other']);
enumCheck(shoes, 'gender', ['women','men','kids','unisex']);
enumCheck(shoes, 'colorFamily', ['red','blue','green','yellow','pink','purple','orange','neutral','earth','teal','multicolor']);
const sConcrete = shoes.filter(p => p.primaryColor && p.primaryColor !== 'Multicolor').length;
console.log(`\n  shoe concrete color (non-Multicolor): ${pctS(sConcrete, shoes.length)}`);

// Any product missing a REQUIRED-ish field (should be zero given validation)
const missingReq = clothing.filter(p => !p.name || !p.price || !p.productUrl || !present(p.images)).length
  + shoes.filter(p => !p.name || !p.price || !p.productUrl || !present(p.images)).length;
console.log(`\n  products missing a required field (name/price/url/images): ${missingReq}`);

process.exit(0);
