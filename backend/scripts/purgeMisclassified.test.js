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
const LEAKED = ['Cambric Top', 'Dobby Top', 'Crepe Co-ord Set', 'Grip Co ord Set', 'Premium Silk Co-ord Set- Embroidered', 'Woolen Jacquard Cardigan', 'Dual Tone Striped Tights', 'Chunky Slip-Ons', 'Rhinestone Slides', 'Square Sunglasses', 'Wavy Hoops', 'Rope Chain Bracelet', 'Viscose Scarf', 'Woolen Blend Shawl', 'Viscose Slub Shirt (Pret)', 'Embroidered Khaddar 2 Piece', 'Casual Chevron Shoulder Bag', 'Ethnic Floral Khussa', 'Formal Glossy Coat Shoes', 'Casual Strap Pumps', 'Athleisure Strap Sneakers'];

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

// ── shoes: Borjan sells scarves and shoulder bags next to its shoes ──
const REAL_SHOES = ['Formal Bow Coat Shoes', 'High Top Sneakers', 'Belted Buckle Sandal', 'Golden Fancy Khussa For Women EC8625', 'Leaf Craft', 'Curve Strap', 'Women Block Heel Pump', 'Pearl Strands Khussa'];
const LEAKED_FROM_SHOES = ['Women Scarf-PINK', 'Women Shoulder Bag-COFFEE', 'Ladies Leather Handbag', 'Dual Tone Striped Tights'];

test('shoes: real shoes (incl. "Coat Shoes" and "High Top") are kept; scarves and bags are flagged', () => {
  const flagged = findMisclassified([...REAL_SHOES, ...LEAKED_FROM_SHOES].map((name) => ({ name })), 'shoes').map((r) => r.name);
  assert.deepEqual(flagged.sort(), [...LEAKED_FROM_SHOES].sort());
});

test('the shoe parser itself rejects scarves/bags and accepts real shoes', async () => {
  const { normalizeShoeProduct } = await import('./scrapers/parsers/shoeParser.js');
  const cfg = { brand: 'Borjan', category: 'shoes', source: 't', subCategory: 'women', gender: 'women' };
  const raw = (title) => ({ title, price: 3000, images: ['https://e.com/a.jpg'], productUrl: `https://e.com/${encodeURIComponent(title)}`, description: '', tags: [] });
  for (const n of LEAKED_FROM_SHOES) assert.equal(normalizeShoeProduct(raw(n), cfg), null, n);
  for (const n of REAL_SHOES) assert.ok(normalizeShoeProduct(raw(n), cfg), `real shoe rejected: ${n}`);
});
