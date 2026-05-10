import Product from '../models/Product.js';

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
      limit = 24
    } = req.query;

    const query = {};
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(48, Math.max(1, parseInt(limit)));

    if (q.trim().length > 0) {
      query.$text = { $search: q };
    }

    if (category) query.category = category;
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
    let products, total;

    if (q.trim().length > 0) {
      [products, total] = await Promise.all([
        Product.find(query, { score: { $meta: 'textScore' }, embedding: 0 })
          .sort({ score: { $meta: 'textScore' } })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Product.countDocuments(query)
      ]);

      if (products.length === 0 && q.trim()) {
        const regexQuery = {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { brand: { $regex: q, $options: 'i' } },
            { tags: { $elemMatch: { $regex: q, $options: 'i' } } },
            { description: { $regex: q, $options: 'i' } }
          ],
          ...(category ? { category } : {}),
          ...(color ? { primaryColor: { $regex: color, $options: 'i' } } : {})
        };
        [products, total] = await Promise.all([
          Product.find(regexQuery, { embedding: 0 })
            .sort({ metadataScore: -1, scrapedAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
          Product.countDocuments(regexQuery)
        ]);
      }
    } else {
      [products, total] = await Promise.all([
        Product.find(query, { embedding: 0 })
          .sort({ scrapedAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Product.countDocuments(query)
      ]);
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

    const products = await Product.find(
      { name: { $regex: q, $options: 'i' } },
      { name: 1, brand: 1, category: 1 }
    ).limit(8).lean();

    const suggestions = products.map((p) => ({
      id: p._id,
      label: `${p.name} — ${p.brand}`,
      category: p.category
    }));

    res.json({ suggestions });
  } catch {
    res.status(500).json({ error: 'Suggestions failed' });
  }
}
