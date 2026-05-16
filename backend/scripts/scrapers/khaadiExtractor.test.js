import test from 'node:test';
import assert from 'node:assert/strict';

import { parseKhaadiCategoryHtml } from './extractors/khaadiExtractor.js';
import { normalizeProduct } from './parsers/productParser.js';

test('parseKhaadiCategoryHtml reads SFCC product tiles', () => {
  const html = `<!DOCTYPE html><html><body>
  <div class="product" data-pid="PID1" data-gtmdata='{"id":"PID1","name":"Test Kurta One","category":"Essentials","price":"5500.00"}'>
    <div class="image-container" data-large-0="https://pk.khaadi.com/img1.jpg?sw=400&amp;sh=600"></div>
    <a class="plpRedirectPdp" href="/test-kurta-one/PID1.html?source=plp">x</a>
  </div>
  <div class="product" data-pid="PID2" data-gtmdata='{"name":"Test Kurta Two","price":"3200"}'>
    <div class="image-container" data-large-0="https://pk.khaadi.com/img2.jpg"></div>
    <a class="link plpRedirectPdp" href="/test-kurta-two/PID2.html">x</a>
  </div>
  </body></html>`;

  const products = parseKhaadiCategoryHtml(html, 'https://pk.khaadi.com/ready-to-wear/', 50);
  assert.equal(products.length, 2);
  assert.equal(products[0].title, 'Test Kurta One');
  assert.equal(products[0].price, 5500);
  assert.equal(products[0].productUrl, 'https://pk.khaadi.com/test-kurta-one/PID1.html');
  assert.ok(products[0].images[0].includes('img1.jpg'));
  assert.ok(products[0].tags.includes('Essentials'));

  const brandConfig = {
    brand: 'Khaadi',
    category: 'clothing',
    subCategory: 'kurta',
    occasion: ['casual'],
    style: ['minimal'],
    source: 'KhaadiAdapter'
  };
  const norm = normalizeProduct(products[0], brandConfig);
  assert.ok(norm);
  assert.equal(norm.name, 'Test Kurta One');
  assert.equal(norm.price, 5500);
  assert.ok(norm.productUrl.startsWith('https://pk.khaadi.com/'));
});
