import express from 'express';
import { getProductRecommendations, generateOutfit, getPersonalStyleAdvice } from '../controllers/recommendationsController.js';

const router = express.Router();

router.post('/outfit', generateOutfit);
router.post('/style-advice', getPersonalStyleAdvice);
router.get('/:productId', getProductRecommendations);

export default router;
