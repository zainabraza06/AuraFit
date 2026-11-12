import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SCRAPER_SKIP_AI = 'true'; // no LLM enrichment / repair in tests
process.env.SCRAPER_MAX_PER_BRAND = '50';

const { BaseAdapter } = await import('./BaseAdapter.js');

class FakeAdapter extends BaseAdapter {
  constructor(products, hooks) {
    super({ brand: 'FakeBrand', baseUrl: 'https://fake.pk', category: 'clothing', collections: [] }, hooks);
    this.products = products;
  }
  async extractCollectionProducts() {
    return { products: this.products, strategy: 'fake' };
  }
}

const raw = (n, extra = {}) => ({
  title: `Embroidered Lawn Suit ${n}`,
  price: 4500,
  images: ['https://fake.pk/img.jpg'],
  productUrl: `https://fake.pk/p/${n}`,
  tags: [],
  sizes: [],
  description: 'A lawn suit',
  ...extra,
});

test('sold-out products are dropped before normalisation; available ones are kept', async () => {
  const adapter = new FakeAdapter([raw(1), raw(2, { isAvailable: false }), raw(3, { isAvailable: true })]);
  const { products } = await adapter.scrapeCollection({ path: '/c', subCategory: '3-piece' });
  const urls = products.map((p) => p.productUrl).sort();
  assert.deepEqual(urls, ['https://fake.pk/p/1', 'https://fake.pk/p/3']);
});

test('a hook-based vertical (custom normaliser that ignores isAvailable) is protected too', async () => {
  let normalised = 0;
  const hooks = {
    normalizeProduct: (r) => { normalised++; return { name: r.title, brand: 'FakeBrand', price: r.price, productUrl: r.productUrl, imageUrl: r.images[0], images: r.images }; },
    validateProduct: () => ({ valid: true }),
    enrichProduct: async (p) => p,
    needsAiRefinement: () => false,
    vertical: 'watches',
  };
  const adapter = new FakeAdapter([raw(1), raw(2, { isAvailable: false })], hooks);
  const { products } = await adapter.scrapeCollection({ path: '/c' });
  assert.equal(products.length, 1);
  assert.equal(normalised, 1, 'the sold-out item must not even reach the normaliser (no wasted work or LLM repair)');
});
