/**
 * Watches — fashion & everyday (Shopify PK).
 * Handles verified against live Shopify products.json per collection (2026).
 * Adapter: WatchBrandAdapter (see runVertical.js).
 */
export const WATCH_BRANDS = [
  {
    brand: 'Stylo',
    baseUrl: 'https://stylo.pk',
    adapter: 'WatchBrandAdapter',
    category: 'watches',
    collections: [
      { path: '/collections/watches', subCategory: 'women', occasion: ['casual', 'party', 'office'], style: ['trendy', 'elegant'], gender: 'women' },
      { path: '/collections/men-watches', subCategory: 'men', occasion: ['casual', 'formal', 'office'], style: ['minimal', 'elegant'], gender: 'men' }
    ]
  },
  {
    brand: 'ECS',
    baseUrl: 'https://shopecs.com',
    adapter: 'WatchBrandAdapter',
    category: 'watches',
    collections: [
      { path: '/collections/watches', subCategory: 'unisex', occasion: ['casual', 'party'], style: ['trendy'], gender: 'unisex' },
      { path: '/collections/women-watches', subCategory: 'women', occasion: ['party', 'office'], style: ['elegant'], gender: 'women' },
      { path: '/collections/men-watches', subCategory: 'men', occasion: ['formal', 'office', 'casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/girls-watches', subCategory: 'kids', occasion: ['casual'], style: ['minimal'], gender: 'kids' }
    ]
  },
  {
    brand: 'Limelight',
    baseUrl: 'https://www.limelight.pk',
    adapter: 'WatchBrandAdapter',
    category: 'watches',
    collections: [
      { path: '/collections/watches', subCategory: 'women', occasion: ['casual', 'party', 'office'], style: ['trendy', 'elegant'], gender: 'women' }
    ]
  }
];
