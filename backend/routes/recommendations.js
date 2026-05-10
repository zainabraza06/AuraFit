import express from 'express';
import { getProductRecommendations, generateOutfit } from '../controllers/recommendationsController.js';

const router = express.Router();

router.get('/:productId', getProductRecommendations);
router.post('/outfit', generateOutfit);

export default router;
