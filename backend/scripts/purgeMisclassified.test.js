import test from 'node:test';
import assert from 'node:assert/strict';
import { findMisclassified } from './purgeMisclassified.js';
import { normalizeWatchProduct } from './scrapers/parsers/watchParser.js';

test('jewelry: flags garments, bags and fragrance; keeps real jewelry (including "tops")', () => {
  const rows = [
    { name: 'Teal Blue Semi-Formal Kameez Shalwar' },
    { name: 'Gold Sun Earrings' },
    { name: 'Pink Tops Earrings' },
    { name: 'Ladies Leather Handbag' },
    { name: 'Floral Perfume 30 ML' },
  ];
  assert.deepEqual(findMisclassified(rows).map((r) => r.name), ['Teal Blue Semi-Formal Kameez Shalwar', 'Ladies Leather Handbag', 'Floral Perfume 30 ML']);
});

// Real names taken from the live catalog. ECS watches have NO "watch" in the name, so they must survive.
const REAL_WATCHES = ['Golden Gents Watch J34107', 'Kids Ferozy Watch', 'Structured Dial', 'Classic Index', 'Tonneau Roman', 'Rotating Bezel', 'Skeleton Exposed', 'Arc Steel', 'Velocity Sport', 'Ridge Band', 'Minimalist Charm'];
const LEAKED = ['Viscose Scarf', 'Woolen Blend Shawl', 'Viscose Slub Shirt (Pret)', 'Embroidered Khaddar 2 Piece', 'Casual Chevron Shoulder Bag', 'Ethnic Floral Khussa', 'Formal Glossy Coat Shoes', 'Casual Strap Pumps', 'Athleisure Strap Sneakers'];

test('watches: real watches are kept, leaked scarves/shoes/bags/garments are flagged', () => {
  const flagged = findMisclassified([...REAL_WATCHES, ...LEAKED].map((name) => ({ name })), 'watches').map((r) => r.name);
  assert.deepEqual(flagged.sort(), [...LEAKED].sort());
});

test('the watch parser itself rejects the leaked items and accepts real ones', () => {
  const cfg = { brand: 'ECS', category: 'watches', source: 't' };
  const raw = (title) => ({ title, price: 5000, images: ['https://e.com/a.jpg'], productUrl: `https://e.com/${encodeURIComponent(title)}`, description: '', tags: [] });
  for (const n of LEAKED) assert.equal(normalizeWatchProduct(raw(n), cfg), null, n);
  for (const n of REAL_WATCHES) assert.ok(normalizeWatchProduct(raw(n), cfg), `real watch rejected: ${n}`);
});
