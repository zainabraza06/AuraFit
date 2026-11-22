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

test('an LLM outage during enrichment keeps the product instead of aborting the scrape', async () => {
  delete process.env.SCRAPER_SKIP_AI; // enrichment path enabled for this test
  const hooks = {
    normalizeProduct: (r) => ({ name: r.title, brand: 'FakeBrand', price: r.price, productUrl: r.productUrl, imageUrl: r.images[0], images: r.images, metadataScore: 0.1 }),
    validateProduct: () => ({ valid: true }),
    enrichProduct: async () => { throw new Error('All LLM providers failed or no API keys configured'); },
    needsAiRefinement: () => true,
    enableLlmRepair: false,
    vertical: 'jewelry',
  };
  try {
    const adapter = new FakeAdapter([raw(1), raw(2)], hooks);
    const { products } = await adapter.scrapeCollection({ path: '/c' });
    assert.equal(products.length, 2, 'products must survive a failed enrichment');
  } finally {
    process.env.SCRAPER_SKIP_AI = 'true';
  }
});

// ── regression: dead collections must not import the whole site into shoes/watches/jewelry ──
class Probe extends BaseAdapter {
  constructor(vertical, keywords = []) {
    super({ brand: 'P', baseUrl: 'https://p.pk', category: vertical, collections: [], shopifyKeywords: keywords }, vertical === 'clothing' ? {} : { vertical, normalizeProduct: () => null, validateProduct: () => ({ valid: false }) });
  }
}

test('site-wide /products.json fallback: allowed for clothing, blocked for other verticals unless keywords are set', () => {
  assert.equal(new Probe('clothing').siteWideFallbackAllowed(), true);
  for (const v of ['watches', 'shoes', 'jewelry']) {
    assert.equal(new Probe(v).siteWideFallbackAllowed(), false, `${v} without keywords must not read the whole site`);
    assert.equal(new Probe(v, ['watch']).siteWideFallbackAllowed(), true, `${v} with explicit keywords may`);
  }
});
