import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import WatchProduct from '../models/WatchProduct.js';
import { getTextEmbedding } from '../services/huggingface.js';
import {
  buildClothingEmbeddingText,
  buildShoeEmbeddingText,
  buildJewelryEmbeddingText
} from '../services/embeddingText.js';
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

const CATALOGS = [
  {
    key: 'clothing',
    Model: ClothingProduct,
    fields: 'embedding name brand category subCategory dressStyle description tags colors price gender images primaryColor occasion style productUrl'
  },
  {
    key: 'shoes',
    Model: ShoeProduct,
    fields: 'embedding name brand category subCategory shoeType description tags colors price gender images primaryColor occasion style productUrl'
  },
  {
    key: 'jewelry',
    Model: JewelryProduct,
    fields: 'embedding name brand category jewelryType jewelryCategory description tags colors price gender images primaryColor occasion style productUrl'
  },
  {
    key: 'watches',
    Model: WatchProduct,
    fields: 'embedding name brand category watchType description tags colors price gender images primaryColor occasion style productUrl'
  }
];

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

    const wantCatalogs = catalog
      ? CATALOGS.filter((c) => c.key === String(catalog).toLowerCase())
      : CATALOGS;

    const perCatalogResults = await Promise.all(
      wantCatalogs.map(async ({ key, Model, fields }) => {
        const matchQuery = { embedding: { $exists: true, $ne: [] } };
        if (category && key === 'clothing') matchQuery.category = category;
        attachGenderFilter(matchQuery, gender ?? signals.genderHint);
        const selectObj = fields.split(' ').reduce((o, f) => ({ ...o, [f]: 1 }), {});
        const docs = await Model.find(matchQuery, selectObj).limit(400).lean();
        return docs.map((d) => ({ ...d, _catalog: key }));
      })
    );

    const products = perCatalogResults.flat();

    if (products.length === 0) {
      return res.json({ results: [], message: 'No products with embeddings found. Run the embedding scripts first.' });
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

    const results = scored.map(({ embedding, _cosine, _facet, _score, _catalog, ...p }) => ({
      ...p,
      catalog: _catalog,
      relevanceScore: parseFloat(_score.toFixed(4)),
      semanticCosine: parseFloat(_cosine.toFixed(4)),
      facetScore: parseFloat(_facet.toFixed(4))
    }));

    res.json({
      query: q,
      engine: 'HuggingFace all-MiniLM-L6-v2',
      hybridRanking: true,
      crossCatalog: !catalog,
      relaxedFloor: relaxed,
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
