/**
 * products.js — Product browsing API
 * GET /api/products        — paginated list with filters
 * GET /api/products/:id    — single product detail
 * GET /api/products/featured — featured/trending products
 */

import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// ─── GET /api/products ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 24,
      category,
      brand,
      occasion,
      style,
      color,
      subCategory,
      minPrice,
      maxPrice,
      sort = 'scrapedAt',
      order = 'desc'
    } = req.query;

    const query = {};

    if (category) query.category = category;
    if (brand) query.brand = { $regex: brand, $options: 'i' };
    if (subCategory) query.subCategory = subCategory;
    if (color) query.$or = [
      { primaryColor: { $regex: color, $options: 'i' } },
      { colors: { $elemMatch: { $regex: color, $options: 'i' } } }
    ];
    if (occasion) query.occasion = { $in: Array.isArray(occasion) ? occasion : [occasion] };
    if (style) query.style = { $in: Array.isArray(style) ? style : [style] };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(48, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const sortObj = { [sort]: order === 'asc' ? 1 : -1 };

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .select('-embedding') // Exclude large embedding vectors from list views
        .lean(),
      Product.countDocuments(query)
    ]);

    res.json({
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
    console.error('Products list error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ─── GET /api/products/featured ───────────────────────────────────────────────
router.get('/featured', async (req, res) => {
  try {
    // Return a balanced mix: 6 clothing + 4 shoes
    const [clothing, shoes] = await Promise.all([
      Product.aggregate([
        { $match: { category: 'clothing', images: { $exists: true, $ne: [] } } },
        { $sample: { size: 6 } },
        { $project: { embedding: 0 } }
      ]),
      Product.aggregate([
        { $match: { category: 'shoes', images: { $exists: true, $ne: [] } } },
        { $sample: { size: 4 } },
        { $project: { embedding: 0 } }
      ])
    ]);

    res.json({ featured: [...clothing, ...shoes] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch featured products' });
  }
});

// ─── GET /api/products/stats ──────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [total, byCategory, byBrand, priceRange] = await Promise.all([
      Product.countDocuments(),
      Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Product.aggregate([
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      Product.aggregate([
        { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' }, avg: { $avg: '$price' } } }
      ])
    ]);

    res.json({
      total,
      byCategory,
      topBrands: byBrand,
      priceRange: priceRange[0] || { min: 0, max: 0, avg: 0 }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('-embedding').lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid product ID' });
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

export default router;
