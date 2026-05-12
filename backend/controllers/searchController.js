import ClothingProduct from '../models/ClothingProduct.js';
import { formatClothingForApi } from '../services/productCompat.js';
import { attachGenderFilter } from '../utils/catalogQuery.js';

async function runClothingFind(query, sortObj, skip, limitNum, withTextScore = false) {
  const proj = withTextScore ? { score: { $meta: 'textScore' }, embedding: 0 } : { embedding: 0 };
  let q = ClothingProduct.find(query, proj).skip(skip).limit(limitNum);
  if (withTextScore) q = q.sort({ score: { $meta: 'textScore' } });
  else q = q.sort(sortObj);
  const raw = await q.lean();
  return raw.map(formatClothingForApi);
}

export async function search(req, res) {
  try {
    const {
      q = '',
      category,
      color,
      occasion,
      minPrice,
      maxPrice,
      page = 1,
      limit = 24,
      gender
    } = req.query;

    const query = {};
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(48, Math.max(1, parseInt(limit)));

    if (q.trim().length > 0) {
      query.$text = { $search: q };
    }

    if (category === 'clothing') query.category = 'clothing';

    attachGenderFilter(query, gender);

    if (color) {
      query.$or = [
        { primaryColor: { $regex: color, $options: 'i' } },
        { colors: { $elemMatch: { $regex: color, $options: 'i' } } }
      ];
    }
    if (occasion) query.occasion = { $in: Array.isArray(occasion) ? occasion : [occasion] };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    const skip = (pageNum - 1) * limitNum;
    const sortObj = { scrapedAt: -1 };
    let products;
    let total;

    const cq = { ...query };
    if (!category) delete cq.category;

    if (q.trim().length > 0) {
      products = await runClothingFind(cq, sortObj, skip, limitNum, true);
      total = await ClothingProduct.countDocuments(cq);
      if (products.length === 0 && q.trim()) {
        const textMatch = {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { brand: { $regex: q, $options: 'i' } },
            { tags: { $elemMatch: { $regex: q, $options: 'i' } } },
            { description: { $regex: q, $options: 'i' } }
          ]
        };
        const andParts = [textMatch];
        if (color) {
          andParts.push({
            $or: [
              { primaryColor: { $regex: color, $options: 'i' } },
              { colors: { $elemMatch: { $regex: color, $options: 'i' } } }
            ]
          });
        }
        const regexQuery = { $and: andParts };
        attachGenderFilter(regexQuery, gender);
        if (category === 'clothing') regexQuery.category = 'clothing';
        if (occasion) regexQuery.occasion = { $in: Array.isArray(occasion) ? occasion : [occasion] };
        if (minPrice || maxPrice) {
          regexQuery.price = {};
          if (minPrice) regexQuery.price.$gte = Number(minPrice);
          if (maxPrice) regexQuery.price.$lte = Number(maxPrice);
        }

        const raw = await ClothingProduct.find(regexQuery, { embedding: 0 })
          .sort({ metadataScore: -1, scrapedAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean();
        products = raw.map(formatClothingForApi);
        total = await ClothingProduct.countDocuments(regexQuery);
      }
    } else {
      const raw = await ClothingProduct.find(cq, { embedding: 0 })
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean();
      products = raw.map(formatClothingForApi);
      total = await ClothingProduct.countDocuments(cq);
    }

    res.json({
      query: q,
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

    const fromClothing = await ClothingProduct.find(
      { name: { $regex: q, $options: 'i' } },
      { name: 1, brand: 1, category: 1 }
    )
      .limit(10)
      .lean();

    const suggestions = fromClothing.map((p) => ({
      id: p._id,
      label: `${p.name} — ${p.brand}`,
      category: p.category || 'clothing'
    }));

    res.json({ suggestions });
  } catch {
    res.status(500).json({ error: 'Suggestions failed' });
  }
}
