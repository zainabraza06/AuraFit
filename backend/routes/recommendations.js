/**
 * recommendations.js — AI Recommendation API
 * GET  /api/recommendations/:productId  — outfit recs for a product page
 * POST /api/recommendations/outfit      — chat-based outfit from intent
 */

import express from 'express';
import { getRecommendations, getOutfitForQuery } from '../services/recommendationEngine.js';
import { parseIntentWithFallback } from '../services/aiService.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// ─── GET /api/recommendations/:productId ──────────────────────────────────────
router.get('/:productId', async (req, res) => {
  try {
    const result = await getRecommendations(req.params.productId, {
      maxShoes: 6, maxClothing: 6
    });
    res.json({
      source: result.source,
      shoes: result.shoes,
      complementaryClothing: result.complementaryClothing,
      generatedAt: result.generatedAt
    });
  } catch (err) {
    if (err.message === 'Product not found') return res.status(404).json({ error: 'Product not found' });
    console.error('Recommendation error:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// ─── POST /api/recommendations/outfit ─────────────────────────────────────────
router.post('/outfit', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Canonical colors reference for the AI
    const CANONICAL_COLORS = [
      'Black', 'White', 'Grey', 'Red', 'Pink', 'Purple',
      'Blue', 'Green', 'Teal', 'Yellow', 'Orange',
      'Gold', 'Beige', 'Brown', 'Multicolor'
    ];

    const prompt = `
You are an expert AI fashion stylist for AuraFit, a Pakistani fashion discovery platform.
Analyze the user request and extract structured fashion intent as JSON.

Return ONLY a valid JSON object with these exact fields:
- color: MUST be one of: ${CANONICAL_COLORS.join(', ')}, Any
- shade: The EXACT color word(s) user mentioned.
- occasion: Array from: ["casual", "wedding", "office", "party", "eid", "formal", "mehndi"]
- style: Array from: ["elegant", "trendy", "minimal", "embroidered", "western", "traditional"]
- maxBudget: Number (PKR). 0 if not mentioned.
- fabric: String (e.g., lawn, chiffon) or null.
- piece: String (e.g., 2-piece, kurta) or null.
- stitching: "stitched", "unstitched", or null.
- intentSummary: One concise sentence.
- aiAnalysis: 2-3 sentences of fashion advice.
`;

    let parsedIntent;
    try {
      const parsed = await parseIntentWithFallback(message, prompt);
      
      // Post-processing & Validation
      const rawColor = (parsed.color || 'Any').trim();
      const isCanonical = CANONICAL_COLORS.includes(rawColor) || rawColor === 'Any';

      parsedIntent = {
        color: isCanonical ? rawColor : (CANONICAL_COLORS.find(
          c => rawColor.toLowerCase().includes(c.toLowerCase())
        ) || 'Any'),
        shade: (parsed.shade && parsed.shade !== 'any') ? parsed.shade.toLowerCase().trim() : null,
        fabric: (parsed.fabric && parsed.fabric !== 'null') ? parsed.fabric.toLowerCase().trim() : null,
        piece: (parsed.piece && parsed.piece !== 'null') ? parsed.piece.toLowerCase().trim() : null,
        stitching: (parsed.stitching && parsed.stitching !== 'null') ? parsed.stitching.toLowerCase().trim() : null,
        occasion: Array.isArray(parsed.occasion) ? parsed.occasion : ['casual'],
        style: Array.isArray(parsed.style) ? parsed.style : ['elegant'],
        maxBudget: typeof parsed.maxBudget === 'number' ? parsed.maxBudget : 0,
        intentSummary: parsed.intentSummary || message,
        aiAnalysis: parsed.aiAnalysis || ''
      };
    } catch (aiErr) {
      console.warn('All AI intent parsing failed, using default fallback:', aiErr.message);
      parsedIntent = {
        color: 'Any',
        occasion: ['casual'],
        style: ['elegant'],
        maxBudget: 0,
        intentSummary: message,
        aiAnalysis: 'Parsing failed, showing broad matches.'
      };
    }

    const outfit = await getOutfitForQuery(parsedIntent);
    res.json({ intent: parsedIntent, outfit });
  } catch (err) {
    console.error('Outfit generation error:', err);
    res.status(500).json({ error: 'Failed to generate outfit' });
  }
});

export default router;
