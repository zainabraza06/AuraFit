import ClothingProduct from '../models/ClothingProduct.js';
import { getTextEmbedding } from '../services/huggingface.js';
import { buildClothingEmbeddingText } from '../services/embeddingText.js';
import {
  analyzeSearchQuery,
  buildSemanticQueryText,
  facetAlignmentScore,
  hybridSearchScore,
  similarityFloor
} from '../services/searchQueryIntel.js';
import { attachGenderFilter } from '../utils/catalogQuery.js';

async function getEmbedding(text) {
  const token = process.env.HUGGING_FACE_API_KEY;
  if (!token) return null;

  const embedding = await getTextEmbedding(text);
  if (!embedding) throw new Error('HuggingFace SDK failed to return embedding');

  return Array.isArray(embedding[0]) ? embedding[0] : embedding;
}

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

export async function semanticSearch(req, res) {
  try {
    const { q = '', limit = 20, category, gender } = req.query;
    if (!q.trim()) return res.status(400).json({ error: 'Query is required' });

    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(503).json({
        error: 'Vector search not configured',
        hint: 'Add HUGGING_FACE_API_KEY to your .env file (free at huggingface.co/settings/tokens)',
        fallback: 'Use /api/search instead'
      });
    }

    const signals = analyzeSearchQuery(q);
    const queryForEmbedding = buildSemanticQueryText(signals);
    const queryEmbedding = await getEmbedding(queryForEmbedding);

    const matchQuery = { embedding: { $exists: true, $ne: [] } };
    if (category) matchQuery.category = category;
    attachGenderFilter(matchQuery, gender ?? signals.genderHint);

    const products = await ClothingProduct.find(matchQuery, {
      embedding: 1,
      name: 1,
      brand: 1,
      category: 1,
      subCategory: 1,
      dressStyle: 1,
      description: 1,
      tags: 1,
      colors: 1,
      price: 1,
      gender: 1,
      images: 1,
      primaryColor: 1,
      occasion: 1,
      style: 1,
      productUrl: 1
    })
      .limit(500)
      .lean();

    if (products.length === 0) {
      return res.json({ results: [], message: 'No products with embeddings found. Run POST /api/search/embed-all first.' });
    }

    const qlen = signals.raw.length;
    const scoredAll = products.map((p) => {
      const cos = cosineSimilarity(queryEmbedding, p.embedding);
      const facet = facetAlignmentScore(signals, p);
      const hybrid = hybridSearchScore(cos, facet, qlen, signals.hasStrongConstraints);
      return { ...p, _cosine: cos, _facet: facet, _score: hybrid };
    });

    const floor = similarityFloor(signals);
    let ranked = scoredAll.filter((p) => p._score >= floor).sort((a, b) => b._score - a._score);
    let relaxed = false;
    if (ranked.length === 0 && scoredAll.length) {
      relaxed = true;
      ranked = [...scoredAll].sort((a, b) => b._score - a._score).slice(0, Math.max(Number(limit), 10));
    }

    const lim = Number(limit);
    const scored = ranked.slice(0, lim);

    const results = scored.map(({ embedding, _cosine, _facet, _score, ...p }) => ({
      ...p,
      relevanceScore: parseFloat(_score.toFixed(4)),
      semanticCosine: parseFloat(_cosine.toFixed(4)),
      facetScore: parseFloat(_facet.toFixed(4))
    }));

    res.json({
      query: q,
      engine: 'HuggingFace all-MiniLM-L6-v2',
      hybridRanking: true,
      relaxedFloor: relaxed,
      count: results.length,
      results
    });
  } catch (err) {
    console.error('[VectorSearch] Error:', err);
    res.status(500).json({ error: 'Semantic search failed', details: err.message });
  }
}

export async function embedAll(req, res) {
  try {
    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(503).json({ error: 'HUGGING_FACE_API_KEY not set' });
    }

    const { limit = 50 } = req.body;
    const products = await ClothingProduct.find({ $or: [{ embedding: { $exists: false } }, { embedding: [] }] })
      .select(
        'name brand subCategory fabric primaryColor style occasion colors description dressStyle pattern stitchedType pieceType tags trendTags colorFamily gender'
      )
      .limit(Number(limit))
      .lean();

    if (products.length === 0) {
      return res.json({ message: 'All clothing products already have embeddings!', updated: 0 });
    }

    let updated = 0, failed = 0;
    for (const product of products) {
      try {
        const text = buildClothingEmbeddingText(product);
        const embedding = await getEmbedding(text);
        if (embedding?.length) {
          await ClothingProduct.findByIdAndUpdate(product._id, { embedding });
          updated++;
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        failed++;
        console.error(`[Embed] Failed for ${product._id}:`, e.message);
      }
    }

    const remaining = await ClothingProduct.countDocuments({
      $or: [{ embedding: { $exists: false } }, { embedding: [] }]
    });
    res.json({ message: 'Embedding complete', updated, failed, remaining });
  } catch (err) {
    res.status(500).json({ error: 'Embedding failed', details: err.message });
  }
}
