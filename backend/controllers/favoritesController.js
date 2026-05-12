import mongoose from 'mongoose';
import Favorite from '../models/Favorite.js';
import ClothingProduct from '../models/ClothingProduct.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import WatchProduct from '../models/WatchProduct.js';

/** Legacy rows created before productKind + refPath existed. */
async function backfillFavoriteProductKinds() {
  await Favorite.updateMany(
    { $or: [{ productKind: { $exists: false } }, { productKind: null }, { productKind: '' }] },
    { $set: { productKind: 'ClothingProduct' } }
  );
}

/**
 * @param {string} productId
 * @returns {Promise<'ClothingProduct'|'ShoeProduct'|'JewelryProduct'|'WatchProduct'|null>}
 */
async function resolveProductKind(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return null;
  if (await ClothingProduct.exists({ _id: productId })) return 'ClothingProduct';
  if (await ShoeProduct.exists({ _id: productId })) return 'ShoeProduct';
  if (await JewelryProduct.exists({ _id: productId })) return 'JewelryProduct';
  if (await WatchProduct.exists({ _id: productId })) return 'WatchProduct';
  return null;
}

export async function getFavorites(req, res) {
  try {
    await backfillFavoriteProductKinds();

    const favorites = await Favorite.find({ user: req.user._id })
      .populate({ path: 'product', select: '-embedding' })
      .sort({ createdAt: -1 })
      .lean();

    const products = favorites.map((f) => f.product).filter(Boolean);
    res.json({ favorites: products, count: products.length });
  } catch {
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
}

export async function toggleFavorite(req, res) {
  try {
    await backfillFavoriteProductKinds();

    const { productId } = req.params;

    const productKind = await resolveProductKind(productId);
    if (!productKind) return res.status(404).json({ error: 'Product not found' });

    const existing = await Favorite.findOne({ user: req.user._id, product: productId });

    if (existing) {
      await existing.deleteOne();
      return res.json({ favorited: false, message: 'Removed from favorites' });
    }

    await Favorite.create({
      user: req.user._id,
      product: productId,
      productKind
    });
    res.status(201).json({ favorited: true, message: 'Added to favorites' });
  } catch (err) {
    if (err.code === 11000) return res.json({ favorited: true, message: 'Already in favorites' });
    res.status(500).json({ error: 'Failed to update favorites' });
  }
}

export async function removeFavorite(req, res) {
  try {
    await Favorite.findOneAndDelete({ user: req.user._id, product: req.params.productId });
    res.json({ favorited: false, message: 'Removed from favorites' });
  } catch {
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
}

export async function checkFavorite(req, res) {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.json({ favorited: false });
    }
    const exists = await Favorite.exists({ user: req.user._id, product: productId });
    res.json({ favorited: !!exists });
  } catch {
    res.status(500).json({ error: 'Failed to check favorite status' });
  }
}
