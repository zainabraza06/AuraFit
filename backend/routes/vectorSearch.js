/**
 * vectorSearch.js — True semantic vector search using HuggingFace embeddings
 * GET /api/search/semantic?q=…  — vector similarity search
 * POST /api/search/embed-all   — generate and store embeddings for all products
 *
 * Uses: sentence-transformers/all-MiniLM-L6-v2 via HuggingFace Inference API (FREE)
 * Falls back to existing text search if HUGGINGFACE_API_KEY is not set.
 */
import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();
import { getTextEmbedding } from '../services/huggingface.js';

// ─── Generate embedding for a text query ─────────────────────────────────────
async function getEmbedding(text) {
  const token = process.env.HUGGING_FACE_API_KEY;
  if (!token) return null;
  
  const embedding = await getTextEmbedding(text);
  if (!embedding) throw new Error('HuggingFace SDK failed to return embedding');
  
  // The SDK usually returns a flat array for text embeddings, but we check just in case
  return Array.isArray(embedding[0]) ? embedding[0] : embedding;
}

// ─── Cosine similarity ─────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

// ─── GET /api/search/semantic ─────────────────────────────────────────────────
router.get('/semantic', async (req, res) => {
  try {
    const { q = '', limit = 20, category } = req.query;
    if (!q.trim()) return res.status(400).json({ error: 'Query is required' });

    // Check if HuggingFace is configured
    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(503).json({
        error: 'Vector search not configured',
        hint: 'Add HUGGING_FACE_API_KEY to your .env file (free at huggingface.co/settings/tokens)',
        fallback: 'Use /api/search instead'
      });
    }

    // 1. Embed the query
    const queryEmbedding = await getEmbedding(q.trim());

    // 2. Fetch products that have embeddings stored
    const matchQuery = { embedding: { $exists: true, $ne: [] } };
    if (category) matchQuery.category = category;

    const products = await Product.find(matchQuery, { embedding: 1, name: 1, brand: 1, category: 1, price: 1, images: 1, primaryColor: 1, occasion: 1, style: 1, productUrl: 1 })
      .limit(500)
      .lean();

    if (products.length === 0) {
      return res.json({ results: [], message: 'No products with embeddings found. Run POST /api/search/embed-all first.' });
    }

    // 3. Score by cosine similarity
    const scored = products
      .map(p => ({ ...p, _score: cosineSimilarity(queryEmbedding, p.embedding) }))
      .filter(p => p._score > 0.2) // Minimum relevance threshold
      .sort((a, b) => b._score - a._score)
      .slice(0, Number(limit));

    // Strip embeddings from response
    const results = scored.map(({ embedding, _score, ...p }) => ({ ...p, relevanceScore: parseFloat(_score.toFixed(4)) }));

    res.json({
      query: q,
      engine: 'HuggingFace all-MiniLM-L6-v2',
      count: results.length,
      results
    });

  } catch (err) {
    console.error('[VectorSearch] Error:', err);
    res.status(500).json({ error: 'Semantic search failed', details: err.message });
  }
});

// ─── POST /api/search/embed-all ───────────────────────────────────────────────
// Batch-generate HuggingFace embeddings for all products without one
router.post('/embed-all', async (req, res) => {
  try {
    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(503).json({ error: 'HUGGING_FACE_API_KEY not set' });
    }

    const { limit = 50 } = req.body;
    const products = await Product.find({ $or: [{ embedding: { $exists: false } }, { embedding: [] }] })
      .select('name brand subCategory fabric primaryColor style occasion colors description')
      .limit(Number(limit))
      .lean();

    if (products.length === 0) {
      return res.json({ message: 'All products already have embeddings!', updated: 0 });
    }

    let updated = 0, failed = 0;
    for (const product of products) {
      try {
        const descSnippet = (product.description || '').slice(0, 300);
        const text = [
          product.name, product.brand, product.subCategory,
          product.fabric, product.primaryColor,
          ...(product.style || []), ...(product.occasion || []), ...(product.colors || []),
          descSnippet
        ].filter(Boolean).join(', ');
        const embedding = await getEmbedding(text);
        if (embedding?.length) {
          await Product.findByIdAndUpdate(product._id, { embedding });
          updated++;
        }
        // Rate limit: 1 request per 300ms to stay within free tier
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        failed++;
        console.error(`[Embed] Failed for ${product._id}:`, e.message);
      }
    }

    res.json({ message: `Embedding complete`, updated, failed, remaining: await Product.countDocuments({ $or: [{ embedding: { $exists: false } }, { embedding: [] }] }) });
  } catch (err) {
    res.status(500).json({ error: 'Embedding failed', details: err.message });
  }
});

export default router;
