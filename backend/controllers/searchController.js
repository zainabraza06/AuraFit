import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import WatchProduct from '../models/WatchProduct.js';
import { formatClothingForApi } from '../services/productCompat.js';
import { attachGenderFilter } from '../utils/catalogQuery.js';

const CATALOGS = [
  { key: 'clothing', Model: ClothingProduct, format: formatClothingForApi },
  { key: 'shoes', Model: ShoeProduct, format: (p) => ({ ...p, category: p.category || 'shoes' }) },
  { key: 'jewelry', Model: JewelryProduct, format: (p) => ({ ...p, category: p.category || 'jewelry' }) },
  { key: 'watches', Model: WatchProduct, format: (p) => ({ ...p, category: p.category || 'watches' }) }
];

function buildFilters({ color, occasion, minPrice, maxPrice, gender }) {
  const f = {};
  attachGenderFilter(f, gender);
  if (color) {
    f.$or = [
      { primaryColor: { $regex: color, $options: 'i' } },
      { colors: { $elemMatch: { $regex: color, $options: 'i' } } }
    ];
  }
  if (occasion) f.occasion = { $in: Array.isArray(occasion) ? occasion : [occasion] };
  if (minPrice || maxPrice) {
    f.price = {};
    if (minPrice) f.price.$gte = Number(minPrice);
    if (maxPrice) f.price.$lte = Number(maxPrice);
  }
  return f;
}

/**
 * Runs a keyword search against one catalog: $text search first, falling back to
 * regex over name/brand/tags/description if $text finds nothing (short/partial words).
 */
async function searchOneCatalog({ key, Model, format }, q, filters, fetchLimit) {
  const base = { ...filters };
  let docs = [];
  if (q) {
    const textQuery = { ...base, $text: { $search: q } };
    docs = await Model.find(textQuery, { score: { $meta: 'textScore' }, embedding: 0 })
      .sort({ score: { $meta: 'textScore' } })
      .limit(fetchLimit)
      .lean();
    if (docs.length === 0) {
      const regexQuery = {
        ...base,
        $and: [
          {
            $or: [
              { name: { $regex: q, $options: 'i' } },
              { brand: { $regex: q, $options: 'i' } },
              { tags: { $elemMatch: { $regex: q, $options: 'i' } } },
              { description: { $regex: q, $options: 'i' } }
            ]
          }
        ]
      };
      docs = await Model.find(regexQuery, { embedding: 0 })
        .sort({ metadataScore: -1, scrapedAt: -1 })
        .limit(fetchLimit)
        .lean();
    }
  } else {
    docs = await Model.find(base, { embedding: 0 }).sort({ scrapedAt: -1 }).limit(fetchLimit).lean();
  }
  return docs.map((d) => ({ ...format(d), catalog: key, _score: d.score ?? 0 }));
}

/**
 * GET /api/search — keyword search across ALL catalogs (clothing, shoes, jewelry,
 * watches), merged and ranked together. Pass ?catalog=clothing (or shoes/jewelry/
 * watches) to restrict to one; ?category=clothing is kept as a legacy alias.
 */
export async function search(req, res) {
  try {
    const {
      q = '',
      category,
      catalog,
      color,
      occasion,
      minPrice,
      maxPrice,
      page = 1,
      limit = 24,
      gender
    } = req.query;

    const query = q.trim();
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(48, Math.max(1, parseInt(limit)));

    const restrictKey = catalog || (category === 'clothing' ? 'clothing' : null);
    const targets = restrictKey ? CATALOGS.filter((c) => c.key === restrictKey) : CATALOGS;

    const filters = buildFilters({ color, occasion, minPrice, maxPrice, gender });
    // Fetch enough from each catalog to cover this page after merge + sort.
    const fetchLimit = pageNum * limitNum + 24;

    const perCatalog = await Promise.all(
      targets.map((c) => searchOneCatalog(c, query, filters, fetchLimit))
    );
    let merged = perCatalog.flat();

    if (query) {
      merged.sort((a, b) => b._score - a._score);
    } else {
      merged.sort((a, b) => new Date(b.scrapedAt || 0) - new Date(a.scrapedAt || 0));
    }
    merged = merged.map(({ _score, ...p }) => p);

    const total = merged.length;
    const skip = (pageNum - 1) * limitNum;
    const products = merged.slice(skip, skip + limitNum);

    res.json({
      query,
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: skip + products.length < total
      }
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
}

export async function getSuggestions(req, res) {
  try {
    const { q = '' } = req.query;
    if (q.length < 2) return res.json({ suggestions: [] });

    const perCatalog = await Promise.all(
      CATALOGS.map(({ key, Model }) =>
        Model.find({ name: { $regex: q, $options: 'i' } }, { name: 1, brand: 1, category: 1 })
          .limit(5)
          .lean()
          .then((docs) => docs.map((p) => ({ id: p._id, label: `${p.name} — ${p.brand}`, category: p.category || key })))
      )
    );

    const suggestions = perCatalog.flat().slice(0, 10);
    res.json({ suggestions });
  } catch {
    res.status(500).json({ error: 'Suggestions failed' });
  }
}
