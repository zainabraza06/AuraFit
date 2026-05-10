import express from 'express';
import { protect } from '../middleware/auth.js';
import { getFavorites, toggleFavorite, removeFavorite, checkFavorite } from '../controllers/favoritesController.js';

const router = express.Router();

router.use(protect);

router.get('/', getFavorites);
router.post('/:productId', toggleFavorite);
router.delete('/:productId', removeFavorite);
router.get('/check/:productId', checkFavorite);

export default router;
