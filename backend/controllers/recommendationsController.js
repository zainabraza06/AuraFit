/**
 * Outfit recommendations API — Style Me + product page recs.
 */
import { parseIntentWithFallback } from '../services/aiService.js';
import { getOutfitForQuery, getRecommendations } from '../services/recommendationEngine.js';
import { buildIntentParsePrompt } from '../services/intentPrompt.js';
import { rawIntentToEngineIntent } from '../services/intentAdapter.js';
import { logger } from '../utils/logger.js';

export async function getProductRecommendations(req, res) {
  try {
    const { productId } = req.params;
    const maxShoes = Math.min(12, parseInt(req.query.maxShoes, 10) || 6);
    const maxClothing = Math.min(12, parseInt(req.query.maxClothing, 10) || 6);
    const data = await getRecommendations(productId, { maxShoes, maxClothing });
    res.json(data);
  } catch (err) {
    if (err.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    console.error('[Recommendations]', err);
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
}

/**
 * POST /api/recommendations/outfit
 * Body: { message: string, prioritiesHint?: string }
 */
export async function generateOutfit(req, res) {
  try {
    const { message, prioritiesHint } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const prompt = buildIntentParsePrompt();
    const raw = await parseIntentWithFallback(String(message).trim(), prompt);
    const intent = rawIntentToEngineIntent(raw, String(message).trim(), prioritiesHint);

    const outfit = await getOutfitForQuery(intent);

    res.json({
      intent,
      aiAnalysis: intent.aiAnalysis || raw?.aiAnalysis || '',
      ...outfit,
      outfit
    });
  } catch (err) {
    console.error('[generateOutfit]', err);
    logger.error('recommendation', `generateOutfit failed: ${err.message}`, {
      userMessage: req.body?.message,
      stack: err.stack?.slice(0, 800),
    });
    res.status(500).json({ error: 'Outfit generation failed', details: err.message });
  }
}
