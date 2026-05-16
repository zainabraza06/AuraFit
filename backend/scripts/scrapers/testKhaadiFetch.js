/**
 * Live smoke: fetches one Khaadi category and prints extracted count + first row.
 * Usage: node scripts/scrapers/testKhaadiFetch.js [categoryUrl]
 */
import { extractFromKhaadiCategory } from './extractors/khaadiExtractor.js';

const url =
  process.argv[2] || 'https://pk.khaadi.com/ready-to-wear/essentials/kurta/';

const { products, strategy } = await extractFromKhaadiCategory(url, 8);
const out = {
  url,
  strategy,
  count: products.length,
  sample: products[0] || null
};
console.log(JSON.stringify(out, null, 2));
if (products.length === 0) process.exit(1);
