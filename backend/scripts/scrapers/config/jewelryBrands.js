/**
 * Fashion jewelry — ethnic & daily wear (Shopify PK).
 * Collection handles verified live where noted (2026).
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
      { path: '/collections/rings', subCategory: 'hand', occasion: ['party', 'eid'], style: ['trendy'], gender: 'women' },
      { path: '/collections/bracelets', subCategory: 'wrist', occasion: ['party', 'casual'], style: ['trendy', 'minimal'], gender: 'women' },
      { path: '/collections/anklets', subCategory: 'wrist', occasion: ['party', 'mehndi', 'casual'], style: ['traditional', 'trendy'], gender: 'women' },
      { path: '/collections/kids-jewelry', subCategory: 'mixed', occasion: ['party', 'eid'], style: ['trendy'], gender: 'kids' },
      { path: '/collections/bridal-jewelry', subCategory: 'bridal', occasion: ['bridal', 'wedding'], style: ['heavy', 'traditional'], gender: 'women' },
      { path: '/collections/jewelry-sale', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },
  {
    brand: 'Limelight',
    baseUrl: 'https://www.limelight.pk',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/anklets', subCategory: 'wrist', occasion: ['party', 'mehndi', 'casual'], style: ['traditional'], gender: 'women' },
      { path: '/collections/bracelets', subCategory: 'wrist', occasion: ['party', 'casual'], style: ['trendy', 'minimal'], gender: 'women' },
      { path: '/collections/earrings', subCategory: 'ear', occasion: ['party', 'eid', 'wedding', 'mehndi'], style: ['traditional', 'trendy'], gender: 'women' },
      { path: '/collections/jewellery', subCategory: 'mixed', occasion: ['party', 'eid'], style: ['traditional', 'elegant'], gender: 'women' },
      { path: '/collections/necklaces', subCategory: 'neck', occasion: ['party', 'wedding', 'formal'], style: ['elegant', 'traditional'], gender: 'women' },
      { path: '/collections/rings', subCategory: 'hand', occasion: ['party', 'eid'], style: ['trendy'], gender: 'women' },
      { path: '/collections/jewelry-sale', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/jewelry-50-sale', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },
  {
    brand: 'Gul Ahmed',
    baseUrl: 'https://www.gulahmedshop.com',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/earrings', subCategory: 'ear', occasion: ['party', 'eid', 'wedding'], style: ['traditional', 'elegant'], gender: 'women' },
      { path: '/collections/necklaces', subCategory: 'neck', occasion: ['party', 'wedding', 'formal'], style: ['elegant', 'traditional'], gender: 'women' },
      { path: '/collections/jewelry', subCategory: 'mixed', occasion: ['party', 'eid', 'casual'], style: ['printed', 'trendy'], gender: 'women' }
    ]
  },
  {
    brand: 'Alkaram',
    baseUrl: 'https://www.alkaramstudio.com',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/jewelry', subCategory: 'mixed', occasion: ['party', 'eid', 'casual'], style: ['traditional', 'trendy'], gender: 'women' }
    ]
  },
  {
    brand: 'Beechtree',
    baseUrl: 'https://beechtree.pk',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/new-arrivals-accessories-jewellery', subCategory: 'mixed', occasion: ['party', 'casual'], style: ['trendy'], gender: 'women' },
      { path: '/collections/sale-accessories-jewellery', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },
  {
    brand: 'Maria B',
    baseUrl: 'https://www.mariab.pk',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/jewelry', subCategory: 'mixed', occasion: ['party', 'eid'], style: ['trendy', 'traditional'], gender: 'women' },
      { path: '/collections/all-jewelry', subCategory: 'mixed', occasion: ['party', 'eid', 'wedding'], style: ['traditional', 'elegant'], gender: 'women' },
      { path: '/collections/earrings', subCategory: 'ear', occasion: ['party', 'mehndi', 'eid'], style: ['trendy', 'traditional'], gender: 'women' },
      { path: '/collections/rings', subCategory: 'hand', occasion: ['party', 'eid'], style: ['trendy'], gender: 'women' },
      { path: '/collections/necklace', subCategory: 'neck', occasion: ['party', 'wedding', 'formal'], style: ['elegant'], gender: 'women' },
      { path: '/collections/anklet', subCategory: 'wrist', occasion: ['party', 'mehndi'], style: ['traditional'], gender: 'women' },
      { path: '/collections/bridal-jewelry', subCategory: 'bridal', occasion: ['bridal', 'wedding'], style: ['heavy', 'traditional'], gender: 'women' },
      { path: '/collections/best-sellers-jewelry', subCategory: 'mixed', occasion: ['party', 'eid'], style: ['trendy'], gender: 'women' },
      { path: '/collections/chic-jewelry', subCategory: 'mixed', occasion: ['party', 'office'], style: ['minimal', 'trendy'], gender: 'women' },
      { path: '/collections/day-wear-jewelry', subCategory: 'mixed', occasion: ['casual', 'office'], style: ['minimal'], gender: 'women' },
      { path: '/collections/desi-jewelry', subCategory: 'mixed', occasion: ['eid', 'mehndi', 'party'], style: ['traditional'], gender: 'women' },
      { path: '/collections/eid-collection-jewelry', subCategory: 'mixed', occasion: ['eid', 'party'], style: ['traditional', 'elegant'], gender: 'women' },
      { path: '/collections/evening-wear-jewelry', subCategory: 'mixed', occasion: ['party', 'formal'], style: ['elegant'], gender: 'women' },
      { path: '/collections/heritage-jewelry', subCategory: 'mixed', occasion: ['wedding', 'party'], style: ['traditional', 'elegant'], gender: 'women' },
      { path: '/collections/kids-jewelry', subCategory: 'mixed', occasion: ['party', 'eid'], style: ['trendy'], gender: 'kids' },
      { path: '/collections/modern-jewelry', subCategory: 'mixed', occasion: ['party', 'office'], style: ['trendy', 'minimal'], gender: 'women' },
      { path: '/collections/jewelry-new-arrivals', subCategory: 'new', occasion: ['party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/palestine-jewelry', subCategory: 'mixed', occasion: ['casual', 'party'], style: ['minimal', 'trendy'], gender: 'women' },
      { path: '/collections/jewelry-sale', subCategory: 'sale', occasion: ['casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/turkish-jewelry', subCategory: 'mixed', occasion: ['party', 'eid'], style: ['elegant', 'trendy'], gender: 'women' },
      { path: '/collections/wedding-wear-jewelry', subCategory: 'bridal', occasion: ['wedding', 'bridal'], style: ['heavy', 'elegant'], gender: 'women' },
      { path: '/collections/western-jewelry', subCategory: 'mixed', occasion: ['party', 'casual'], style: ['trendy', 'western'], gender: 'women' },
      { path: '/collections/zircon-fine-jewelry', subCategory: 'mixed', occasion: ['party', 'formal'], style: ['elegant', 'minimal'], gender: 'women' }
    ]
  },
  {
    brand: 'J.',
    baseUrl: 'https://www.junaidjamshed.com',
    adapter: 'JewelryBrandAdapter',
    category: 'jewelry',
    collections: [
      { path: '/collections/womens-jewelry', subCategory: 'mixed', occasion: ['party', 'eid', 'casual'], style: ['traditional', 'minimal'], gender: 'women' },
      { path: '/collections/womens-featured-collection-artisanal-jewellery', subCategory: 'mixed', occasion: ['party', 'wedding'], style: ['traditional', 'elegant'], gender: 'women' },
      { path: '/collections/boys-girls-kids-girls-jewelry', subCategory: 'mixed', occasion: ['eid', 'party'], style: ['trendy'], gender: 'kids' }
    ]
  },
];
