import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import WatchProduct from '../models/WatchProduct.js';
import { formatClothingForApi } from '../services/productCompat.js';
import { attachGenderFilter } from '../utils/catalogQuery.js';

const ACCESSORY_MODELS = [
  { key: 'shoes', Model: ShoeProduct },
  { key: 'jewelry', Model: JewelryProduct },
  { key: 'watches', Model: WatchProduct }
];

export async function getProducts(req, res) {
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
      order = 'desc',
      gender
    } = req.query;

    const query = {};
    if (brand) query.brand = { $regex: brand, $options: 'i' };
    if (subCategory) query.subCategory = subCategory;
    attachGenderFilter(query, gender);
    if (color) {
      query.$or = [
        { primaryColor: { $regex: color, $options: 'i' } },
        { colors: { $elemMatch: { $regex: color, $options: 'i' } } }
      ];
    }
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

    if (category === 'clothing') query.category = 'clothing';
    const cq = { ...query };
    if (!category) delete cq.category;

    const [raw, total] = await Promise.all([
      ClothingProduct.find(cq).sort(sortObj).skip(skip).limit(limitNum).select('-embedding').lean(),
      ClothingProduct.countDocuments(cq)
    ]);
    const products = raw.map(formatClothingForApi);

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
}

export async function getFeaturedProducts(req, res) {
  try {
    const match = { images: { $exists: true, $ne: [] } };
    attachGenderFilter(match, req.query.gender);

    const clothingRaw = await ClothingProduct.aggregate([
      { $match: match },
      { $sample: { size: 10 } },
      { $project: { embedding: 0 } }
    ]);
    const featured = clothingRaw.map(formatClothingForApi);
    res.json({ featured });
  } catch {
    res.status(500).json({ error: 'Failed to fetch featured products' });
  }
}

export async function getProductStats(req, res) {
  try {
    const [total, cByBrand, cPrice] = await Promise.all([
      ClothingProduct.countDocuments(),
      ClothingProduct.aggregate([
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 }
      ]),
      ClothingProduct.aggregate([
        { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' }, avg: { $avg: '$price' } } }
      ])
    ]);

    const byCategory = [{ _id: 'clothing', count: total }];

    res.json({
      total,
      byCategory,
      topBrands: cByBrand,
      priceRange: cPrice[0] || { min: 0, max: 0, avg: 0 }
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

/**
 * Looks up a product by id across ALL catalogs — clothing is checked first (the
 * common case), then shoes/jewelry/watches so accessory cards from search never 404.
 */
export async function getProductById(req, res) {
  try {
    const raw = await ClothingProduct.findById(req.params.id).select('-embedding').lean();
    if (raw) return res.json({ product: formatClothingForApi(raw) });

    for (const { key, Model } of ACCESSORY_MODELS) {
      const doc = await Model.findById(req.params.id).select('-embedding').lean();
      if (doc) return res.json({ product: { ...doc, category: doc.category || key } });
    }

    return res.status(404).json({ error: 'Product not found' });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid product ID' });
    res.status(500).json({ error: 'Failed to fetch product' });
  }
}
