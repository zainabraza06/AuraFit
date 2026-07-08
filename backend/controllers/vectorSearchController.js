import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import {
  buildClothingEmbeddingText,
  buildShoeEmbeddingText,
  buildJewelryEmbeddingText
} from '../services/embeddingText.js';
import { analyzeSearchQuery, buildSemanticQueryText } from '../services/searchQueryIntel.js';
import { getEmbedding, searchAcrossCatalogs } from '../services/crossCatalogSearch.js';

/**
 * Semantic search across ALL catalogs (clothing, shoes, jewelry, watches) merged
 * by score — so a query like "black heels" surfaces shoes even though the same
 * endpoint also serves clothing description-based results like "lawn suit".
 * Pass ?catalog=shoes (or clothing/jewelry/watches) to restrict to one.
 */
export async function semanticSearch(req, res) {
  try {
    const { q = '', limit = 20, category, gender, catalog } = req.query;
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

    const { results, relaxedFloor, totalCandidates } = await searchAcrossCatalogs(signals, queryEmbedding, {
      limit: Number(limit), gender, catalog, category
    });

    if (totalCandidates === 0) {
      return res.json({ results: [], message: 'No products with embeddings found. Run the embedding scripts first.' });
    }

    res.json({
      query: q,
      engine: 'HuggingFace all-MiniLM-L6-v2',
      hybridRanking: true,
      crossCatalog: !catalog,
      relaxedFloor,
      count: results.length,
      results
    });
  } catch (err) {
    console.error('[VectorSearch] Error:', err);
    res.status(500).json({ error: 'Semantic search failed', details: err.message });
  }
}

const EMBED_BUILDERS = {
  clothing: { Model: ClothingProduct, build: buildClothingEmbeddingText },
  shoes: { Model: ShoeProduct, build: buildShoeEmbeddingText },
  jewelry: { Model: JewelryProduct, build: buildJewelryEmbeddingText }
};

export async function embedAll(req, res) {
  try {
    if (!process.env.HUGGING_FACE_API_KEY) {
      return res.status(503).json({ error: 'HUGGING_FACE_API_KEY not set' });
    }

    const { limit = 50, catalog = 'clothing' } = req.body;
    const entry = EMBED_BUILDERS[catalog] || EMBED_BUILDERS.clothing;
    const { Model, build } = entry;

    const products = await Model.find({ $or: [{ embedding: { $exists: false } }, { embedding: [] }] })
      .limit(Number(limit))
      .lean();

    if (products.length === 0) {
      return res.json({ message: `All ${catalog} products already have embeddings!`, updated: 0 });
    }

    let updated = 0, failed = 0;
    for (const product of products) {
      try {
        const text = build(product);
        const embedding = await getEmbedding(text);
        if (embedding?.length) {
          await Model.findByIdAndUpdate(product._id, { embedding });
          updated++;
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        failed++;
        console.error(`[Embed] Failed for ${product._id}:`, e.message);
      }
    }

    const remaining = await Model.countDocuments({
      $or: [{ embedding: { $exists: false } }, { embedding: [] }]
    });
    res.json({ message: 'Embedding complete', catalog, updated, failed, remaining });
  } catch (err) {
    res.status(500).json({ error: 'Embedding failed', details: err.message });
  }
}
