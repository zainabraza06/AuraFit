import express from 'express';
import { cacheResponse } from '../middleware/cache.js';
import { getProducts, getFeaturedProducts, getProductStats, getProductById } from '../controllers/productsController.js';

const router = express.Router();

// Catalogue data changes only on scrape runs, so short TTLs are safe (no-op without REDIS_URL)
router.get('/', cacheResponse(60), getProducts);
router.get('/featured', cacheResponse(300), getFeaturedProducts);
router.get('/stats', cacheResponse(300), getProductStats);
router.get('/:id', cacheResponse(120), getProductById);

export default router;
