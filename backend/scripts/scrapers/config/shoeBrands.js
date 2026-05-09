/**
 * shoeBrands.js
 * Centralized config for all shoe brand scraper targets.
 *
 * Unified subCategory vocabulary (used across all brands):
 *   'heels'    — high heels, stilettos, block heels, pumps, court shoes
 *   'flats'    — flat shoes, ballet flats, loafers, moccasins
 *   'sandals'  — open sandals, chappals, slippers
 *   'khussa'   — traditional khussa, kohati, ethnic footwear
 *   'sneakers' — sneakers, trainers, joggers
 *   'boots'    — ankle boots, long boots
 *   'mules'    — mules, back-open shoes, wedges
 *   'other'    — misc / sale / new arrivals
 */

export const SHOE_BRANDS = [

  // ─── Stylo ──────────────────────────────────────────────────────────────────
  {
    brand: 'Stylo',
    baseUrl: 'https://stylo.pk',
    adapter: 'StyloAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/heels',      subCategory: 'heels',    occasion: ['party', 'wedding', 'office', 'eid'],  style: ['elegant', 'trendy'] },
      { path: '/collections/flats',      subCategory: 'flats',    occasion: ['casual', 'office'],                   style: ['minimal'] },
      { path: '/collections/sandals',    subCategory: 'sandals',  occasion: ['casual', 'party'],                    style: ['trendy'] },
      { path: '/collections/khussa',     subCategory: 'khussa',   occasion: ['eid', 'wedding', 'mehndi'],           style: ['traditional', 'embroidered'] },
      { path: '/collections/back-open',  subCategory: 'mules',    occasion: ['casual', 'party'],                    style: ['trendy', 'minimal'] },
      { path: '/collections/ethnic',     subCategory: 'khussa',   occasion: ['eid', 'wedding', 'mehndi'],           style: ['traditional', 'embroidered'] }
    ]
  },

  // ─── ECS ─────────────────────────────────────────────────────────────────────
  {
    brand: 'ECS',
    baseUrl: 'https://shopecs.com',
    adapter: 'ECSAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-heels',   subCategory: 'heels',    occasion: ['party', 'office', 'wedding', 'eid'], style: ['elegant', 'trendy'] },
      { path: '/collections/women-sandals', subCategory: 'sandals',  occasion: ['casual', 'party'],                   style: ['trendy'] },
      { path: '/collections/women-khussa',  subCategory: 'khussa',   occasion: ['eid', 'wedding', 'mehndi'],          style: ['traditional', 'embroidered'] },
      { path: '/collections/women-footwear',subCategory: 'flats',    occasion: ['casual', 'office'],                  style: ['minimal'] },
      { path: '/collections/sale',          subCategory: 'other',    occasion: ['casual'],                            style: ['minimal'] }
    ]
  },

  // ─── Borjan ──────────────────────────────────────────────────────────────────
  {
    brand: 'Borjan',
    baseUrl: 'https://www.borjan.com.pk',
    adapter: 'BorjanAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-heels',    subCategory: 'heels',    occasion: ['party', 'wedding', 'office', 'eid'], style: ['elegant', 'trendy'] },
      { path: '/collections/women-flats',    subCategory: 'flats',    occasion: ['casual', 'office'],                  style: ['minimal'] },
      { path: '/collections/women-sandals',  subCategory: 'sandals',  occasion: ['casual', 'party'],                   style: ['trendy'] },
      { path: '/collections/women-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'],                  style: ['western', 'trendy'] },
      { path: '/collections/new-in-women',   subCategory: 'other',    occasion: ['casual', 'party'],                   style: ['trendy'] },
      { path: '/collections/sale',           subCategory: 'other',    occasion: ['casual'],                            style: ['minimal'] }
    ]
  },

  // ─── Hush Puppies Pakistan ───────────────────────────────────────────────────
  {
    brand: 'Hush Puppies',
    baseUrl: 'https://www.hushpuppies.com.pk',
    adapter: 'HushPuppiesAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women',         subCategory: 'other',    occasion: ['casual', 'office', 'formal'],        style: ['minimal', 'elegant'] },
      { path: '/collections/women-casual',  subCategory: 'flats',    occasion: ['casual'],                            style: ['minimal'] }
    ]
  },

  // ─── Ndure ───────────────────────────────────────────────────────────────────
  {
    brand: 'Ndure',
    baseUrl: 'https://ndure.com',
    adapter: 'NdureAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-sneakers',          subCategory: 'sneakers', occasion: ['casual', 'sports'],              style: ['western', 'trendy'] },
      { path: '/collections/women-sandals',           subCategory: 'sandals',  occasion: ['casual', 'party'],               style: ['trendy'] },
      { path: '/collections/women-flats',             subCategory: 'flats',    occasion: ['casual', 'office'],              style: ['minimal'] },
      { path: '/collections/women-heels-all-products',subCategory: 'heels',    occasion: ['party', 'office', 'eid'],        style: ['elegant', 'trendy'] },
      { path: '/collections/women-boots',             subCategory: 'boots',    occasion: ['casual', 'formal', 'winter'],    style: ['western', 'minimal'] },
      { path: '/collections/sale-women',              subCategory: 'other',    occasion: ['casual'],                        style: ['minimal'] }
    ]
  }

];
