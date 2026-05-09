/**
 * favorites.js — User favorites API
 * POST   /api/favorites/:productId   — toggle favorite
 * GET    /api/favorites              — get user's favorites
 * DELETE /api/favorites/:productId   — remove favorite
 */

import express from 'express';
import Favorite from '../models/Favorite.js';
import Product from '../models/Product.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All favorites routes require authentication
router.use(protect);

// ─── GET /api/favorites ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user._id })
      .populate({ path: 'product', select: '-embedding' })
      .sort({ createdAt: -1 })
      .lean();

    const products = favorites.map((f) => f.product).filter(Boolean);
    res.json({ favorites: products, count: products.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// ─── POST /api/favorites/:productId (toggle) ──────────────────────────────────
router.post('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    // Verify product exists
    const product = await Product.findById(productId).select('_id name').lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Check if already favorited
    const existing = await Favorite.findOne({ user: req.user._id, product: productId });

    if (existing) {
      await existing.deleteOne();
      return res.json({ favorited: false, message: 'Removed from favorites' });
    }

    await Favorite.create({ user: req.user._id, product: productId });
    res.status(201).json({ favorited: true, message: 'Added to favorites' });
  } catch (err) {
    if (err.code === 11000) return res.json({ favorited: true, message: 'Already in favorites' });
    res.status(500).json({ error: 'Failed to update favorites' });
  }
});

// ─── DELETE /api/favorites/:productId ────────────────────────────────────────
router.delete('/:productId', async (req, res) => {
  try {
    await Favorite.findOneAndDelete({ user: req.user._id, product: req.params.productId });
    res.json({ favorited: false, message: 'Removed from favorites' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// ─── GET /api/favorites/check/:productId ─────────────────────────────────────
router.get('/check/:productId', async (req, res) => {
  try {
    const exists = await Favorite.exists({ user: req.user._id, product: req.params.productId });
    res.json({ favorited: !!exists });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check favorite status' });
  }
});

export default router;
