/**
 * recommendations.js — AI Recommendation API
 * GET /api/recommendations/:productId   — outfit recommendations for a product
 * POST /api/recommendations/outfit      — outfit from chat intent
 */

import express from 'express';
import { getRecommendations, getOutfitForQuery } from '../services/recommendationEngine.js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// ─── GET /api/recommendations/:productId ──────────────────────────────────────
router.get('/:productId', async (req, res) => {
  try {
    const result = await getRecommendations(req.params.productId, {
      maxShoes: 6,
      maxClothing: 6
    });

    res.json({
      source: result.source,
      shoes: result.shoes,
      complementaryClothing: result.complementaryClothing,
      generatedAt: result.generatedAt
    });
  } catch (err) {
    if (err.message === 'Product not found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    console.error('Recommendation error:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// ─── POST /api/recommendations/outfit ─────────────────────────────────────────
// Chat-based outfit generation using Gemini for intent parsing
router.post('/outfit', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Parse intent with Gemini
    let parsedIntent = { color: 'Any', occasion: ['casual'], style: ['elegant'], maxBudget: 0 };

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `
You are an AI fashion stylist for a Pakistani platform.
Parse the following user request and extract fashion intent as JSON.
User Request: "${message}"

Return ONLY a valid JSON object with:
- color (string, e.g. "Black", "Pink", or "Any")
- occasion (array from: ["casual", "wedding", "office", "party", "eid", "formal", "mehndi"])
- style (array from: ["elegant", "trendy", "minimal", "embroidered", "western", "traditional"])
- maxBudget (number in PKR, 0 if not specified)
- intentSummary (string, 1 sentence)
`;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json', temperature: 0.1 }
        });
        let text = response.text;
        if (text.includes('```')) text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedIntent = JSON.parse(text);
      } catch (aiErr) {
        console.warn('Gemini intent parsing failed, using defaults:', aiErr.message);
      }
    }

    const outfit = await getOutfitForQuery(parsedIntent);

    res.json({ intent: parsedIntent, outfit });
  } catch (err) {
    console.error('Outfit generation error:', err);
    res.status(500).json({ error: 'Failed to generate outfit' });
  }
});

export default router;
