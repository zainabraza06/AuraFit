import express from 'express';
import { quota } from '../middleware/quota.js';
import { getProductRecommendations, generateOutfit, getPersonalStyleAdvice } from '../controllers/recommendationsController.js';

const router = express.Router();

// These call the LLM chain (several requests each): cap per caller per day, like the other costly endpoints.
const llmQuota = quota({ name: 'recommendations-llm', limit: Number(process.env.OUTFIT_DAILY_LIMIT || 100), anonymousLimit: Number(process.env.OUTFIT_ANON_DAILY_LIMIT || 25), windowMs: 24 * 3600 * 1000 });

router.post('/outfit', llmQuota, generateOutfit);
router.post('/style-advice', llmQuota, getPersonalStyleAdvice);
router.get('/:productId', getProductRecommendations);

export default router;
