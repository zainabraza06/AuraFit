/**
 * agent/tools.js — the stylist's capabilities as plain, typed functions.
 *
 * One definition, three consumers: the LangGraph agent (agent/graph.js), the MCP server
 * (mcp/server.js) and tests. A tool is { name, description, input (zod), readOnly, needsUser, handler }.
 * Handlers return small JSON-able results (never embeddings, never whole descriptions): they are the
 * data an LLM or an MCP client will read, so size matters.
 *
 * All tools are READ-ONLY. Anything that spends money or mutates state (try-on, saving favourites)
 * is deliberately not here: an agent loop must not be able to trigger it.
 */
import { z } from 'zod';
import mongoose from 'mongoose';
import ClothingProduct from '../../models/ClothingProduct.js';
import ShoeProduct from '../../models/ShoeProduct.js';
import JewelryProduct from '../../models/JewelryProduct.js';
import WatchProduct from '../../models/WatchProduct.js';
import WardrobeItem from '../../models/WardrobeItem.js';
import { analyzeSearchQuery, buildSemanticQueryText } from '../searchQueryIntel.js';
import { getEmbedding, searchAcrossCatalogs, regexSearchAcrossCatalogs } from '../crossCatalogSearch.js';
import { pickBestShoe, pickJewelrySet, pickWatch } from '../accessoryMatcher.js';
import { scoreProduct } from '../recommendationEngine.js';
import { isEmbeddingConfigured } from '../embeddings.js';

const MODELS = { clothing: ClothingProduct, shoes: ShoeProduct, jewelry: JewelryProduct, watches: WatchProduct };
const CatalogEnum = z.enum(['clothing', 'shoes', 'jewelry', 'watches']);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'must be a 24-character product id');

/** The few fields an LLM/client needs to talk about a product. */
export function compactProduct(p, catalog) {
  return {
    id: String(p._id),
    catalog: catalog || p.catalog || p.category,
    name: p.name,
    brand: p.brand,
    price: p.price,
    currency: p.currency || 'PKR',
    color: p.primaryExactColor || p.primaryColor,
    type: p.dressStyle || p.shoeType || p.jewelryType || p.watchType || p.subCategory,
    occasion: (p.occasion || []).slice(0, 4),
    gender: p.gender,
    url: p.productUrl,
    image: p.imageUrl || p.images?.[0],
    ...(p.relevanceScore != null ? { relevance: p.relevanceScore } : {}),
  };
}

async function findProduct(id, catalog) {
  const order = catalog ? [catalog] : Object.keys(MODELS);
  for (const key of order) {
    const doc = await MODELS[key].findById(id, { embedding: 0 }).lean();
    if (doc) return { doc, catalog: key };
  }
  return null;
}

async function inStockPool(Model, gender, limit = 300) {
  const q = { inStock: { $ne: false } };
  if (gender && gender !== 'unisex') q.gender = { $in: [gender, 'unisex'] };
  return Model.find(q, { embedding: 0 }).limit(limit).lean();
}

export const TOOLS = [
  {
    name: 'search_catalog',
    description:
      'Search the live product catalog (clothing, shoes, jewelry, watches) from 14 Pakistani brands. Only in-stock items are returned. ' +
      'Use natural language including colour, occasion, garment type and fabric, e.g. "maroon embroidered lawn suit for eid".',
    input: z.object({
      query: z.string().min(2).max(300),
      catalog: CatalogEnum.optional().describe('restrict to one catalog'),
      gender: z.enum(['women', 'men', 'kids', 'unisex']).optional(),
      maxPrice: z.number().positive().optional().describe('maximum price in PKR'),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    readOnly: true,
    async handler({ query, catalog, gender, maxPrice, limit = 5 }) {
      const signals = analyzeSearchQuery(query);
      const want = maxPrice ? Math.min(limit * 4, 40) : limit;
      let results;
      let mode = 'semantic';
      if (isEmbeddingConfigured()) {
        const embedding = await getEmbedding(buildSemanticQueryText(signals));
        ({ results } = await searchAcrossCatalogs(signals, embedding, { limit: want, catalog, gender }));
      } else {
        mode = 'keyword';
        const keywords = signals.lower.split(/\s+/).filter((w) => w.length > 2);
        ({ results } = await regexSearchAcrossCatalogs({ color: signals.hasExplicitColor ? signals.colorIntel.colors : [], keywords, gender }, { limit: want, catalog }));
      }
      if (maxPrice) results = results.filter((r) => r.price <= maxPrice);
      return { mode, count: Math.min(results.length, limit), products: results.slice(0, limit).map((r) => compactProduct(r, r.catalog)) };
    },
  },

  {
    name: 'get_product',
    description: 'Full details of one product by id (description, sizes, fabric, colours, stock). Use after search_catalog.',
    input: z.object({ id: objectId, catalog: CatalogEnum.optional() }),
    readOnly: true,
    async handler({ id, catalog }) {
      const found = await findProduct(id, catalog);
      if (!found) return { error: 'not_found' };
      const { doc, catalog: key } = found;
      return {
        ...compactProduct(doc, key),
        description: String(doc.description || '').slice(0, 1200),
        fabric: doc.fabric,
        sizes: doc.sizes,
        colors: doc.colors,
        tags: (doc.tags || []).slice(0, 15),
        inStock: doc.inStock !== false,
      };
    },
  },

  {
    name: 'suggest_accessories',
    description: 'For one outfit (a clothing product id), pick the best matching footwear, a jewelry set and a watch from in-stock items, each with a reason.',
    input: z.object({ id: objectId, occasions: z.array(z.string()).max(5).optional() }),
    readOnly: true,
    async handler({ id, occasions }) {
      const found = await findProduct(id, 'clothing');
      if (!found) return { error: 'not_found', hint: 'id must be a clothing product' };
      const dress = found.doc;
      const occ = occasions?.length ? occasions : dress.occasion || [];
      const [shoes, jewelry, watches] = await Promise.all([
        inStockPool(ShoeProduct, dress.gender),
        inStockPool(JewelryProduct, dress.gender),
        inStockPool(WatchProduct, dress.gender),
      ]);
      const shoe = pickBestShoe(dress, shoes);
      const jewels = pickJewelrySet(dress, occ, jewelry, { maxItems: 3 });
      const watch = pickWatch(dress, occ, watches);
      return {
        outfit: compactProduct(dress, 'clothing'),
        shoe: shoe && { ...compactProduct(shoe.product, 'shoes'), score: shoe.score, reason: shoe.reason },
        jewelry: jewels.map((j) => ({ ...compactProduct(j.product, 'jewelry'), score: j.score, reason: j.reason })),
        watch: watch && { ...compactProduct(watch.product, 'watches'), score: watch.score, reason: watch.reason },
      };
    },
  },

  {
    name: 'score_pair',
    description: 'How well two products go together (0-1): embedding similarity, colour compatibility, occasion and style overlap.',
    input: z.object({ idA: objectId, idB: objectId }),
    readOnly: true,
    async handler({ idA, idB }) {
      const [a, b] = await Promise.all([
        findProduct(idA).then((f) => f && MODELS[f.catalog].findById(idA).lean()),
        findProduct(idB).then((f) => f && MODELS[f.catalog].findById(idB).lean()),
      ]);
      if (!a || !b) return { error: 'not_found' };
      return { a: a.name, b: b.name, ...scoreProduct(a, b) };
    },
  },

  {
    name: 'get_wardrobe',
    description: "The signed-in user's saved wardrobe items. Requires a user; not available to anonymous callers.",
    input: z.object({}),
    readOnly: true,
    needsUser: true,
    async handler(_args, ctx) {
      if (!ctx?.userId || !mongoose.isValidObjectId(ctx.userId)) return { error: 'not_signed_in' };
      const items = await WardrobeItem.find({ user: ctx.userId }).sort({ createdAt: -1 }).limit(50).lean();
      return { count: items.length, items: items.map((i) => ({ id: String(i._id), name: i.name, category: i.category, color: i.primaryColor, tags: i.tags })) };
    },
  },
];

export const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/**
 * Validate input with the tool's schema, run it, and never throw: agents and MCP clients get a
 * structured error they can react to.
 */
export async function runTool(name, rawArgs, ctx = {}) {
  const tool = TOOL_BY_NAME[name];
  if (!tool) return { error: 'unknown_tool', tool: name };
  if (tool.needsUser && !ctx.userId) return { error: 'not_signed_in' };
  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) return { error: 'invalid_arguments', issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'input'}: ${i.message}`) };
  try {
    return await tool.handler(parsed.data, ctx);
  } catch (e) {
    return { error: 'tool_failed', message: String(e.message).slice(0, 200) };
  }
}
