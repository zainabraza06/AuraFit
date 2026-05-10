import express from 'express';
import { getProducts, getFeaturedProducts, getProductStats, getProductById } from '../controllers/productsController.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/stats', getProductStats);
router.get('/:id', getProductById);

export default router;
