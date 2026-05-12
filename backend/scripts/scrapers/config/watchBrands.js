/**
 * Watches — fashion & everyday (Shopify multi-brand PK).
 * Adapter: WatchBrandAdapter (see runVertical.js).
 */
export const WATCH_BRANDS = [
  {
    brand: 'Stylo',
    baseUrl: 'https://stylo.pk',
    adapter: 'WatchBrandAdapter',
    category: 'watches',
    collections: [
      { path: '/collections/womens-watches', subCategory: 'women', occasion: ['casual', 'party', 'office'], style: ['trendy', 'elegant'], gender: 'women' },
      { path: '/collections/mens-watches', subCategory: 'men', occasion: ['casual', 'formal', 'office'], style: ['minimal', 'elegant'], gender: 'men' },
      { path: '/collections/couple-watches', subCategory: 'couple', occasion: ['wedding', 'eid', 'party'], style: ['elegant'], gender: 'unisex' },
      { path: '/collections/smart-watches', subCategory: 'smart', occasion: ['casual', 'sports'], style: ['trendy'], gender: 'unisex' },
      { path: '/collections/kids-watches', subCategory: 'kids', occasion: ['casual'], style: ['minimal'], gender: 'kids' },
      { path: '/collections/new-arrival-watches', subCategory: 'new', occasion: ['casual', 'party'], style: ['trendy'], gender: 'unisex' },
      { path: '/collections/sale-watches', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'unisex' }
    ]
  },
  {
    brand: 'ECS',
    baseUrl: 'https://shopecs.com',
    adapter: 'WatchBrandAdapter',
    category: 'watches',
    collections: [
      { path: '/collections/womens-watches', subCategory: 'women', occasion: ['party', 'office'], style: ['elegant'], gender: 'women' },
      { path: '/collections/mens-watches', subCategory: 'men', occasion: ['formal', 'office', 'casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/smart-watches', subCategory: 'smart', occasion: ['casual'], style: ['trendy'], gender: 'unisex' },
      { path: '/collections/couple-watches', subCategory: 'couple', occasion: ['wedding', 'eid'], style: ['elegant'], gender: 'unisex' },
      { path: '/collections/sale-watches', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'unisex' }
    ]
  },
  {
    brand: 'Borjan',
    baseUrl: 'https://www.borjan.com.pk',
    adapter: 'WatchBrandAdapter',
    category: 'watches',
    collections: [
      { path: '/collections/womens-watches', subCategory: 'women', occasion: ['party', 'office'], style: ['elegant'], gender: 'women' },
      { path: '/collections/mens-watches', subCategory: 'men', occasion: ['formal', 'casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/new-in-watches', subCategory: 'new', occasion: ['casual'], style: ['trendy'], gender: 'unisex' },
      { path: '/collections/sale-watches', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'unisex' }
    ]
  }
];
