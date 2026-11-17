import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import ClothingProduct from '../models/ClothingProduct.js';
import { EMBEDDING_MODEL_ID, setEmbeddingBackend } from '../services/embeddings.js';
import { clearVectorCache } from '../services/vectorCache.js';
import { createMcpServer } from '../services/agent/mcpServer.js';
import { createMcpRouter, tokenMatches } from '../routes/mcp.js';

let mongod;

before(async () => {
  process.env.NODE_ENV = 'test';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  setEmbeddingBackend({ embed: async (texts) => texts.map(() => [1, 0, 0]) });
  clearVectorCache();
  await ClothingProduct.create({ name: 'Maroon Lawn Suit', brand: 'B', gender: 'women', price: 4000, primaryColor: 'Red', productUrl: 'https://t.pk/m', embedding: [1, 0, 0], embeddingModel: EMBEDDING_MODEL_ID, inStock: true });
});

after(async () => {
  setEmbeddingBackend(null);
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

async function connectInMemory(opts) {
  const server = createMcpServer(opts);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

test('MCP: lists the read-only tools; wardrobe is hidden without a user', async () => {
  const { client, close } = await connectInMemory();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  assert.ok(names.includes('search_catalog') && names.includes('suggest_accessories'));
  assert.ok(!names.includes('get_wardrobe'), 'user-bound tool must not be advertised to anonymous clients');
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
  assert.ok(tools.find((t) => t.name === 'search_catalog').inputSchema.properties.query);
  await close();

  const withUser = await connectInMemory({ userId: String(new mongoose.Types.ObjectId()) });
  assert.ok((await withUser.client.listTools()).tools.some((t) => t.name === 'get_wardrobe'));
  await withUser.close();
});

test('MCP: calling search_catalog returns JSON text; bad input is an isError result, not a crash', async () => {
  const { client, close } = await connectInMemory();
  const ok = await client.callTool({ name: 'search_catalog', arguments: { query: 'maroon lawn suit', catalog: 'clothing' } });
  assert.equal(ok.isError, false);
  const payload = JSON.parse(ok.content[0].text);
  assert.equal(payload.products[0].name, 'Maroon Lawn Suit');

  const bad = await client.callTool({ name: 'get_product', arguments: { id: 'nope' } }).catch((e) => ({ isError: true, thrown: e.message }));
  assert.equal(bad.isError, true);
  await close();
});

test('MCP over HTTP: 401 without the token, works with it, GET is rejected', async () => {
  assert.equal(tokenMatches('Bearer s3cret', 's3cret'), true);
  assert.equal(tokenMatches('Bearer s3cre', 's3cret'), false);
  assert.equal(tokenMatches(undefined, 's3cret'), false);
  assert.equal(tokenMatches('Bearer anything', ''), false, 'an empty configured token never matches');

  const app = express();
  app.use('/mcp', createMcpRouter({ token: 's3cret' }));
  const httpServer = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const url = new URL(`http://127.0.0.1:${httpServer.address().port}/mcp`);
  try {
    const anon = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
    assert.equal(anon.status, 401);
    assert.equal((await fetch(url, { headers: { authorization: 'Bearer s3cret' } })).status, 405);

    const client = new Client({ name: 'http-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: 'Bearer s3cret' } } }));
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === 'search_catalog'));
    const res = await client.callTool({ name: 'search_catalog', arguments: { query: 'maroon lawn suit' } });
    assert.equal(JSON.parse(res.content[0].text).products[0].name, 'Maroon Lawn Suit');
    await client.close();
  } finally {
    httpServer.close();
  }
});
