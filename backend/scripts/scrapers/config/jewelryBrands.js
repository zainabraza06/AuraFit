/**
 * Fashion jewelry — ethnic & daily wear.
 */
export const JEWELRY_BRANDS = [
  {
    brand: 'Stylo',
    baseUrl: 'https://stylo.pk',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/earrings', subCategory: 'ear', occasion: ['party', 'eid', 'wedding', 'mehndi'], style: ['traditional', 'trendy'], gender: 'women' },
      { path: '/collections/necklaces', subCategory: 'neck', occasion: ['party', 'wedding', 'formal'], style: ['elegant', 'traditional'], gender: 'women' },
      { path: '/collections/sets', subCategory: 'set', occasion: ['bridal', 'wedding', 'mehndi'], style: ['heavy', 'traditional'], gender: 'women' },
      { path: '/collections/rings', subCategory: 'hand', occasion: ['party', 'eid'], style: ['trendy'], gender: 'women' },
      { path: '/collections/bracelets', subCategory: 'wrist', occasion: ['party', 'casual'], style: ['trendy', 'minimal'], gender: 'women' },
      { path: '/collections/bangles', subCategory: 'wrist', occasion: ['eid', 'mehndi', 'wedding'], style: ['traditional'], gender: 'women' },
      { path: '/collections/bridal-jewelry', subCategory: 'bridal', occasion: ['bridal', 'wedding'], style: ['heavy', 'traditional'], gender: 'women' },
      { path: '/collections/mens-accessories', subCategory: 'men', occasion: ['formal', 'wedding'], style: ['minimal'], gender: 'men' },
      { path: '/collections/sale-jewelry', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },
  {
    brand: 'ECS',
    baseUrl: 'https://shopecs.com',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/women-jewellery', subCategory: 'mixed', occasion: ['party', 'eid'], style: ['traditional', 'trendy'], gender: 'women' },
      { path: '/collections/earrings', subCategory: 'ear', occasion: ['party', 'mehndi'], style: ['trendy'], gender: 'women' },
      { path: '/collections/necklaces', subCategory: 'neck', occasion: ['party', 'wedding'], style: ['elegant'], gender: 'women' },
      { path: '/collections/sets', subCategory: 'set', occasion: ['bridal', 'wedding'], style: ['heavy'], gender: 'women' },
      { path: '/collections/sale-jewelry', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },
  {
    brand: 'Borjan',
    baseUrl: 'https://www.borjan.com.pk',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/women-jewellery', subCategory: 'mixed', occasion: ['party', 'eid'], style: ['trendy'], gender: 'women' },
      { path: '/collections/earrings', subCategory: 'ear', occasion: ['party', 'casual'], style: ['minimal', 'trendy'], gender: 'women' },
      { path: '/collections/necklaces', subCategory: 'neck', occasion: ['party', 'formal'], style: ['elegant'], gender: 'women' },
      { path: '/collections/new-in-jewelry', subCategory: 'new', occasion: ['party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/sale-jewelry', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  }
];
