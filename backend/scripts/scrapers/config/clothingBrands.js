/**
 * clothingBrands.js
 * Centralized config for all clothing brand scraper targets.
 * Each entry defines which collections to scrape and how to classify products.
 */

export const CLOTHING_BRANDS = [
  // ─── Beechtree ──────────────────────────────────────────────────────────────
  {
    brand: 'Beechtree',
    baseUrl: 'https://beechtree.pk',
    adapter: 'BeechtreeAdapter',
    category: 'clothing',
    collections: [
      { path: '/collections/2-piece',    subCategory: '2-piece',  occasion: ['casual', 'office'],           style: ['printed', 'minimal'] },
      { path: '/collections/3-piece',    subCategory: '3-piece',  occasion: ['casual', 'party'],            style: ['printed', 'elegant'] },
      { path: '/collections/pret',       subCategory: 'pret',     occasion: ['casual', 'office'],           style: ['trendy', 'minimal'] },
      { path: '/collections/bottoms',    subCategory: 'other',    occasion: ['casual'],                     style: ['minimal'] },
      { path: '/collections/western-wear', subCategory: 'western', occasion: ['casual', 'party'],           style: ['western', 'trendy'] },
      { path: '/collections/sale',       subCategory: 'other',    occasion: ['casual'],                     style: ['minimal'] }
    ]
  },

  // ─── Limelight ──────────────────────────────────────────────────────────────
  {
    brand: 'Limelight',
    baseUrl: 'https://www.limelight.pk',
    adapter: 'LimelightAdapter',
    category: 'clothing',
    collections: [
      { path: '/collections/unstitched',                           subCategory: 'unstitched', occasion: ['casual', 'office'],  style: ['printed'] },
      { path: '/collections/unstitched-printed-shirt-trouser',     subCategory: '2-piece',    occasion: ['casual'],            style: ['printed'] },
      { path: '/collections/unstitched-glam-printed-shirt-dupatta', subCategory: '2-piece',   occasion: ['party', 'casual'],   style: ['printed', 'trendy'] },
      { path: '/collections/pret',                                 subCategory: 'pret',       occasion: ['casual', 'office'],  style: ['minimal', 'trendy'] },
      { path: '/collections/western-wear',                         subCategory: 'western',    occasion: ['casual', 'party'],   style: ['western'] },
      { path: '/collections/sale',                                 subCategory: 'other',      occasion: ['casual'],            style: ['minimal'] }
    ]
  },

  // ─── Khaadi ─────────────────────────────────────────────────────────────────
  {
    brand: 'Khaadi',
    baseUrl: 'https://pk.khaadi.com',
    adapter: 'KhaadiAdapter',
    category: 'clothing',
    collections: [
      { path: '/fabrics/essentials/2-piece/', subCategory: '2-piece', occasion: ['casual', 'office'],      style: ['minimal', 'printed'] },
      { path: '/fabrics/essentials/3-piece/', subCategory: '3-piece', occasion: ['casual', 'party'],       style: ['elegant', 'printed'] },
      { path: '/fabrics/unstitched/',         subCategory: 'unstitched', occasion: ['casual', 'eid'],      style: ['printed'] },
      { path: '/ready-to-wear/',              subCategory: 'pret',    occasion: ['casual', 'office'],      style: ['minimal', 'trendy'] },
      { path: '/western-wear/',               subCategory: 'western', occasion: ['casual'],                style: ['western'] },
      { path: '/sale/',                       subCategory: 'other',   occasion: ['casual'],                style: ['minimal'] }
    ]
  },

  // ─── Alkaram Studio ──────────────────────────────────────────────────────────
  {
    brand: 'Alkaram Studio',
    baseUrl: 'https://alkaram.com',
    adapter: 'AlkaramAdapter',
    category: 'clothing',
    collections: [
      { path: '/collections/2-piece',        subCategory: '2-piece',  occasion: ['casual', 'office'],      style: ['printed', 'minimal'] },
      { path: '/collections/3-piece',        subCategory: '3-piece',  occasion: ['party', 'casual'],       style: ['elegant', 'printed'] },
      { path: '/collections/ready-to-wear',  subCategory: 'pret',     occasion: ['casual', 'office'],      style: ['trendy', 'minimal'] },
      { path: '/collections/festive-wear',   subCategory: 'festive',  occasion: ['eid', 'party', 'wedding'], style: ['embroidered', 'elegant'] },
      { path: '/collections/sale',           subCategory: 'other',    occasion: ['casual'],                style: ['minimal'] }
    ]
  },

  // ─── Gul Ahmed ───────────────────────────────────────────────────────────────
  {
    brand: 'Gul Ahmed',
    baseUrl: 'https://www.gulahmedshop.com',
    adapter: 'GulAhmedAdapter',
    category: 'clothing',
    collections: [
      { path: '/unstitched/2-piece',   subCategory: '2-piece',  occasion: ['casual', 'office'],          style: ['printed', 'minimal'] },
      { path: '/unstitched/3-piece',   subCategory: '3-piece',  occasion: ['party', 'casual'],           style: ['printed', 'elegant'] },
      { path: '/ready-to-wear',        subCategory: 'pret',     occasion: ['casual', 'office'],          style: ['minimal', 'trendy'] },
      { path: '/formals',              subCategory: 'festive',  occasion: ['wedding', 'eid', 'formal'],  style: ['embroidered', 'heavy'] },
      { path: '/sale',                 subCategory: 'other',    occasion: ['casual'],                    style: ['minimal'] }
    ]
  }
];
