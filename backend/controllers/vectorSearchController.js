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
import { isEmbeddingConfigured, EMBEDDING_MODEL_ID } from '../services/embeddings.js';
import { embedPending } from '../services/embeddingJobs.js';

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

    if (!isEmbeddingConfigured()) {
      return res.status(503).json({
        error: 'Vector search not configured',
        hint: 'The local embedding model is disabled in this environment',
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
      engine: EMBEDDING_MODEL_ID,
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
    if (!isEmbeddingConfigured()) {
      return res.status(503).json({ error: 'Embeddings are disabled in this environment' });
    }

    const { limit = 50, catalog = 'clothing' } = req.body;
    const { Model, build } = EMBED_BUILDERS[catalog] || EMBED_BUILDERS.clothing;

    // Embeds rows with no vector OR a vector from a different/older model
    const { embedded, failed, remaining } = await embedPending(Model, build, { limit: Number(limit) });
    res.json({ message: 'Embedding complete', catalog, model: EMBEDDING_MODEL_ID, updated: embedded, failed, remaining });
  } catch (err) {
    res.status(500).json({ error: 'Embedding failed', details: err.message });
  }
}
