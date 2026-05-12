/**
 * shoeBrands.js — Footwear targets (women, men, kids, athletic, ethnic).
 * Paths are Shopify collection handles; 404 collections are skipped at runtime.
 */

export const SHOE_BRANDS = [

  {
    brand: 'Stylo',
    baseUrl: 'https://stylo.pk',
    adapter: 'StyloAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-heels', subCategory: 'heels', occasion: ['party', 'wedding', 'office', 'eid', 'bridal'], style: ['elegant', 'trendy'], gender: 'women' },
      { path: '/collections/women-pumps', subCategory: 'heels', occasion: ['party', 'formal', 'office'], style: ['elegant'], gender: 'women' },
      { path: '/collections/women-wedges', subCategory: 'heels', occasion: ['party', 'casual', 'eid'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-block-heels', subCategory: 'heels', occasion: ['party', 'office', 'wedding'], style: ['elegant'], gender: 'women' },
      { path: '/collections/women-stilettos', subCategory: 'heels', occasion: ['party', 'wedding', 'bridal'], style: ['elegant'], gender: 'women' },
      { path: '/collections/women-flats', subCategory: 'flats', occasion: ['casual', 'office'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-ballerinas', subCategory: 'flats', occasion: ['casual', 'office'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-loafers', subCategory: 'flats', occasion: ['casual', 'office', 'formal'], style: ['minimal', 'western'], gender: 'women' },
      { path: '/collections/women-mules', subCategory: 'mules', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-sandals', subCategory: 'sandals', occasion: ['casual', 'party', 'mehndi'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-slides', subCategory: 'sandals', occasion: ['casual', 'summer'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-chappals', subCategory: 'sandals', occasion: ['casual', 'eid'], style: ['traditional'], gender: 'women' },
      { path: '/collections/women-khussa', subCategory: 'khussa', occasion: ['eid', 'wedding', 'mehndi', 'bridal'], style: ['traditional', 'embroidered'], gender: 'women' },
      { path: '/collections/women-kolhapuri', subCategory: 'ethnic', occasion: ['casual', 'eid', 'mehndi'], style: ['traditional'], gender: 'women' },
      { path: '/collections/women-peshawari', subCategory: 'ethnic', occasion: ['eid', 'casual'], style: ['traditional'], gender: 'women' },
      { path: '/collections/women-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'], style: ['western', 'trendy'], gender: 'women' },
      { path: '/collections/women-athletic-shoes', subCategory: 'athletic', occasion: ['sports', 'casual'], style: ['western'], gender: 'women' },
      { path: '/collections/women-boots', subCategory: 'boots', occasion: ['winter', 'casual', 'formal'], style: ['western'], gender: 'women' },
      { path: '/collections/women-school-shoes', subCategory: 'kids', occasion: ['office', 'casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-bridal-shoes', subCategory: 'formal', occasion: ['bridal', 'wedding'], style: ['elegant', 'heavy'], gender: 'women' },
      { path: '/collections/women-formal-shoes', subCategory: 'formal', occasion: ['formal', 'office', 'party'], style: ['elegant'], gender: 'women' },
      { path: '/collections/women-casual-shoes', subCategory: 'casual', occasion: ['casual'], style: ['trendy', 'minimal'], gender: 'women' },
      { path: '/collections/women-slippers', subCategory: 'sandals', occasion: ['casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-espadrilles', subCategory: 'casual', occasion: ['casual', 'summer'], style: ['trendy'], gender: 'women' },
      { path: '/collections/mens-formal-shoes', subCategory: 'formal', occasion: ['formal', 'office', 'wedding'], style: ['elegant'], gender: 'men' },
      { path: '/collections/mens-casual-shoes', subCategory: 'casual', occasion: ['casual'], style: ['minimal', 'trendy'], gender: 'men' },
      { path: '/collections/mens-loafers', subCategory: 'flats', occasion: ['casual', 'office', 'formal'], style: ['minimal'], gender: 'men' },
      { path: '/collections/mens-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'], style: ['western'], gender: 'men' },
      { path: '/collections/mens-sandals', subCategory: 'sandals', occasion: ['casual', 'eid'], style: ['traditional', 'minimal'], gender: 'men' },
      { path: '/collections/mens-chappals', subCategory: 'sandals', occasion: ['casual', 'eid'], style: ['traditional'], gender: 'men' },
      { path: '/collections/mens-khussa', subCategory: 'khussa', occasion: ['eid', 'wedding', 'mehndi'], style: ['traditional'], gender: 'men' },
      { path: '/collections/mens-peshawari', subCategory: 'ethnic', occasion: ['eid', 'casual'], style: ['traditional'], gender: 'men' },
      { path: '/collections/mens-boots', subCategory: 'boots', occasion: ['winter', 'casual'], style: ['western'], gender: 'men' },
      { path: '/collections/mens-athletic-shoes', subCategory: 'athletic', occasion: ['sports', 'casual'], style: ['western'], gender: 'men' },
      { path: '/collections/mens-school-shoes', subCategory: 'kids', occasion: ['casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/kids-girls-shoes', subCategory: 'kids', occasion: ['casual', 'party'], style: ['trendy'], gender: 'kids' },
      { path: '/collections/kids-boys-shoes', subCategory: 'kids', occasion: ['casual', 'sports'], style: ['minimal'], gender: 'kids' },
      { path: '/collections/kids-school-shoes', subCategory: 'kids', occasion: ['casual'], style: ['minimal'], gender: 'kids' },
      { path: '/collections/heels', subCategory: 'heels', occasion: ['party', 'wedding'], style: ['elegant'], gender: 'women' },
      { path: '/collections/flats', subCategory: 'flats', occasion: ['casual', 'office'], style: ['minimal'], gender: 'women' },
      { path: '/collections/sandals', subCategory: 'sandals', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/khussa', subCategory: 'khussa', occasion: ['eid', 'wedding', 'mehndi'], style: ['traditional'], gender: 'women' },
      { path: '/collections/back-open', subCategory: 'mules', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/ethnic', subCategory: 'ethnic', occasion: ['eid', 'wedding'], style: ['traditional'], gender: 'women' },
      { path: '/collections/sale', subCategory: 'other', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },

  {
    brand: 'ECS',
    baseUrl: 'https://shopecs.com',
    adapter: 'ECSAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-heels', subCategory: 'heels', occasion: ['party', 'office', 'wedding', 'eid'], style: ['elegant', 'trendy'], gender: 'women' },
      { path: '/collections/women-pumps', subCategory: 'heels', occasion: ['party', 'formal'], style: ['elegant'], gender: 'women' },
      { path: '/collections/women-wedges', subCategory: 'heels', occasion: ['party', 'casual'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-sandals', subCategory: 'sandals', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-flats', subCategory: 'flats', occasion: ['casual', 'office'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-loafers', subCategory: 'flats', occasion: ['office', 'casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-mules', subCategory: 'mules', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-khussa', subCategory: 'khussa', occasion: ['eid', 'wedding', 'mehndi'], style: ['traditional'], gender: 'women' },
      { path: '/collections/women-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'], style: ['western'], gender: 'women' },
      { path: '/collections/women-boots', subCategory: 'boots', occasion: ['winter', 'casual'], style: ['western'], gender: 'women' },
      { path: '/collections/women-athletic', subCategory: 'athletic', occasion: ['sports'], style: ['western'], gender: 'women' },
      { path: '/collections/men-formal-shoes', subCategory: 'formal', occasion: ['formal', 'wedding', 'office'], style: ['elegant'], gender: 'men' },
      { path: '/collections/men-casual-shoes', subCategory: 'casual', occasion: ['casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/men-sandals', subCategory: 'sandals', occasion: ['casual', 'eid'], style: ['traditional'], gender: 'men' },
      { path: '/collections/men-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'], style: ['western'], gender: 'men' },
      { path: '/collections/men-khussa', subCategory: 'khussa', occasion: ['eid', 'mehndi'], style: ['traditional'], gender: 'men' },
      { path: '/collections/kids-shoes', subCategory: 'kids', occasion: ['casual'], style: ['minimal'], gender: 'kids' },
      { path: '/collections/women-footwear', subCategory: 'other', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/sale', subCategory: 'other', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },

  {
    brand: 'Borjan',
    baseUrl: 'https://www.borjan.com.pk',
    adapter: 'BorjanAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-heels', subCategory: 'heels', occasion: ['party', 'wedding', 'office', 'eid'], style: ['elegant', 'trendy'], gender: 'women' },
      { path: '/collections/women-pumps', subCategory: 'heels', occasion: ['party', 'formal'], style: ['elegant'], gender: 'women' },
      { path: '/collections/women-wedges', subCategory: 'heels', occasion: ['party', 'casual'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-flats', subCategory: 'flats', occasion: ['casual', 'office'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-loafers', subCategory: 'flats', occasion: ['office', 'casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-sandals', subCategory: 'sandals', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-khussa', subCategory: 'khussa', occasion: ['eid', 'wedding', 'mehndi'], style: ['traditional'], gender: 'women' },
      { path: '/collections/women-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'], style: ['western'], gender: 'women' },
      { path: '/collections/women-boots', subCategory: 'boots', occasion: ['winter', 'casual'], style: ['western'], gender: 'women' },
      { path: '/collections/women-mules', subCategory: 'mules', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/men-formal-shoes', subCategory: 'formal', occasion: ['formal', 'office'], style: ['elegant'], gender: 'men' },
      { path: '/collections/men-casual-shoes', subCategory: 'casual', occasion: ['casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/men-sandals', subCategory: 'sandals', occasion: ['casual', 'eid'], style: ['traditional'], gender: 'men' },
      { path: '/collections/men-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'], style: ['western'], gender: 'men' },
      { path: '/collections/men-loafers', subCategory: 'flats', occasion: ['office', 'casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/kids-shoes', subCategory: 'kids', occasion: ['casual'], style: ['minimal'], gender: 'kids' },
      { path: '/collections/new-in-women', subCategory: 'other', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/sale', subCategory: 'other', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },

  {
    brand: 'Hush Puppies',
    baseUrl: 'https://www.hushpuppies.com.pk',
    adapter: 'HushPuppiesAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women', subCategory: 'other', occasion: ['casual', 'office', 'formal'], style: ['minimal', 'elegant'], gender: 'women' },
      { path: '/collections/women-casual', subCategory: 'casual', occasion: ['casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-formal', subCategory: 'formal', occasion: ['formal', 'office'], style: ['elegant'], gender: 'women' },
      { path: '/collections/women-sandals', subCategory: 'sandals', occasion: ['casual', 'summer'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-loafers', subCategory: 'flats', occasion: ['office', 'casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/men', subCategory: 'other', occasion: ['casual', 'office', 'formal'], style: ['minimal'], gender: 'men' },
      { path: '/collections/men-casual', subCategory: 'casual', occasion: ['casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/men-formal', subCategory: 'formal', occasion: ['formal', 'office'], style: ['elegant'], gender: 'men' },
      { path: '/collections/men-sandals', subCategory: 'sandals', occasion: ['casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/men-loafers', subCategory: 'flats', occasion: ['office', 'casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/kids', subCategory: 'kids', occasion: ['casual'], style: ['minimal'], gender: 'kids' },
      { path: '/collections/sale', subCategory: 'other', occasion: ['casual'], style: ['minimal'], gender: 'women' }
    ]
  },

  {
    brand: 'Ndure',
    baseUrl: 'https://ndure.com',
    adapter: 'NdureAdapter',
    category: 'shoes',
    collections: [
      { path: '/collections/women-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'], style: ['western', 'trendy'], gender: 'women' },
      { path: '/collections/women-running-shoes', subCategory: 'athletic', occasion: ['sports'], style: ['western'], gender: 'women' },
      { path: '/collections/women-sandals', subCategory: 'sandals', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-flats', subCategory: 'flats', occasion: ['casual', 'office'], style: ['minimal'], gender: 'women' },
      { path: '/collections/women-heels-all-products', subCategory: 'heels', occasion: ['party', 'office', 'eid'], style: ['elegant', 'trendy'], gender: 'women' },
      { path: '/collections/women-wedges', subCategory: 'heels', occasion: ['party', 'casual'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-mules', subCategory: 'mules', occasion: ['casual', 'party'], style: ['trendy'], gender: 'women' },
      { path: '/collections/women-boots', subCategory: 'boots', occasion: ['casual', 'formal', 'winter'], style: ['western', 'minimal'], gender: 'women' },
      { path: '/collections/women-loafers', subCategory: 'flats', occasion: ['office', 'casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/men-sneakers', subCategory: 'sneakers', occasion: ['casual', 'sports'], style: ['western'], gender: 'men' },
      { path: '/collections/men-casual-shoes', subCategory: 'casual', occasion: ['casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/men-formal-shoes', subCategory: 'formal', occasion: ['formal', 'office'], style: ['elegant'], gender: 'men' },
      { path: '/collections/men-sandals', subCategory: 'sandals', occasion: ['casual', 'eid'], style: ['traditional'], gender: 'men' },
      { path: '/collections/men-loafers', subCategory: 'flats', occasion: ['office', 'casual'], style: ['minimal'], gender: 'men' },
      { path: '/collections/men-boots', subCategory: 'boots', occasion: ['winter', 'casual'], style: ['western'], gender: 'men' },
      { path: '/collections/kids-shoes', subCategory: 'kids', occasion: ['casual'], style: ['minimal'], gender: 'kids' },
      { path: '/collections/sale-women', subCategory: 'other', occasion: ['casual'], style: ['minimal'], gender: 'women' },
      { path: '/collections/sale-men', subCategory: 'other', occasion: ['casual'], style: ['minimal'], gender: 'men' }
    ]
  }
];
