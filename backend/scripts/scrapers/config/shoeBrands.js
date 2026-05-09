/**
 * shoeBrands.js
 * Centralized config for all shoe brand scraper targets.
 */

export const SHOE_BRANDS = [
  // ─── Stylo ──────────────────────────────────────────────────────────────────
  {
    brand: 'Stylo',
    baseUrl: 'https://stylo.pk',
    adapter: 'StyloAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/heels',   subCategory: 'heels',   occasion: ['party', 'wedding', 'office'], style: ['elegant'] },
      { path: '/collections/flats',   subCategory: 'flats',   occasion: ['casual', 'office'],           style: ['minimal'] },
      { path: '/collections/sandals', subCategory: 'sandals', occasion: ['casual', 'party'],            style: ['trendy'] },
      { path: '/collections/khussa',  subCategory: 'khussa',  occasion: ['eid', 'wedding', 'mehndi'],   style: ['traditional', 'embroidered'] }
    ]
  },

  // ─── ECS ─────────────────────────────────────────────────────────────────────
  {
    brand: 'ECS',
    baseUrl: 'https://ecs.com.pk',
    adapter: 'ECSAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/heels',   subCategory: 'heels',   occasion: ['party', 'office', 'wedding'], style: ['elegant', 'trendy'] },
      { path: '/collections/flats',   subCategory: 'flats',   occasion: ['casual', 'office'],           style: ['minimal'] },
      { path: '/collections/sandals', subCategory: 'sandals', occasion: ['casual', 'party'],            style: ['trendy'] }
    ]
  },

  // ─── Borjan ──────────────────────────────────────────────────────────────────
  {
    brand: 'Borjan',
    baseUrl: 'https://www.borjan.com.pk',
    adapter: 'BorjanAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-heels',   subCategory: 'heels',   occasion: ['party', 'wedding', 'office'], style: ['elegant'] },
      { path: '/collections/women-flats',   subCategory: 'flats',   occasion: ['casual', 'office'],           style: ['minimal'] },
      { path: '/collections/women-sandals', subCategory: 'sandals', occasion: ['casual', 'party'],            style: ['trendy'] }
    ]
  },

  // ─── Hush Puppies Pakistan ───────────────────────────────────────────────────
  {
    brand: 'Hush Puppies',
    baseUrl: 'https://www.hushpuppies.com.pk',
    adapter: 'HushPuppiesAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women',        subCategory: 'other',   occasion: ['casual', 'office'],           style: ['minimal', 'elegant'] },
      { path: '/collections/women-casual', subCategory: 'flats',   occasion: ['casual'],                     style: ['minimal'] }
    ]
  },

  // ─── Ndure ───────────────────────────────────────────────────────────────────
  {
    brand: 'Ndure',
    baseUrl: 'https://ndure.com',
    adapter: 'NdureAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'],       style: ['western', 'trendy'] },
      { path: '/collections/women-sandals',  subCategory: 'sandals',  occasion: ['casual', 'party'],        style: ['trendy'] },
      { path: '/collections/women-flats',    subCategory: 'flats',    occasion: ['casual', 'office'],       style: ['minimal'] }
    ]
  }
];
