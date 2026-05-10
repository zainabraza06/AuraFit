/**
 * recommendations.js — AI Recommendation API
 * GET  /api/recommendations/:productId  — outfit recs for a product page
 * POST /api/recommendations/outfit      — chat-based outfit from intent
 */

import express from 'express';
import { getRecommendations, getOutfitForQuery } from '../services/recommendationEngine.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

    let parsedIntent = {
      color: 'Any',
      occasion: ['casual'],
      style: ['elegant'],
      maxBudget: 0,
      intentSummary: message,
      aiAnalysis: 'Looking for stylish Pakistani fashion based on your request.'
    };

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `
You are an expert AI fashion stylist for AuraFit, a Pakistani fashion discovery platform.
Analyze the user request below and extract structured fashion intent as JSON.

User Request: "${message}"

Return ONLY a valid JSON object with these exact fields:

- color: (string) The specific color requested, properly capitalized.
  Examples: "Purple", "Navy Blue", "Pastel Pink", "Emerald Green".
  IMPORTANT: Be precise. "purple" -> "Purple". "mauve" -> "Purple". "lavender" -> "Purple". "pastel" alone -> infer the most likely pastel color from context or use "Any".
  If truly no color is mentioned, use "Any".

- occasion: (array of strings) Pick all that apply from:
  ["casual", "wedding", "office", "party", "eid", "formal", "mehndi"]

- style: (array of strings) Pick all that apply from:
  ["elegant", "trendy", "minimal", "embroidered", "western", "traditional"]

- maxBudget: (number) Budget limit in PKR. Use 0 if no budget is mentioned.

- intentSummary: (string) One concise sentence capturing what the user wants.

- aiAnalysis: (string) 2-3 sentences explaining:
  1. What the user is looking for and why those specific attributes were chosen.
  2. What style of Pakistani outfit would work best for this request.
  3. Any relevant fashion tips for this combination (color pairing, occasion appropriateness, etc.).
  Be specific to Pakistani fashion context (lawn suits, shalwar kameez, formal wear, etc.).

Example for "purple dress for eid":
{
  "color": "Purple",
  "occasion": ["eid"],
  "style": ["elegant", "traditional"],
  "maxBudget": 0,
  "intentSummary": "An elegant purple outfit perfect for Eid celebrations.",
  "aiAnalysis": "Purple is a regal and festive color that pairs beautifully with Eid celebrations. A deep purple or lavender 3-piece suit with embroidered detailing would be ideal. For accessories, gold jewelry and nude or gold heels complement purple tones perfectly in Pakistani formal wear."
}
`;
        const model = ai.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { responseMimeType: 'application/json', temperature: 0.15 }
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        if (text.includes('```')) text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);

        parsedIntent = {
          color: parsed.color || 'Any',
          occasion: Array.isArray(parsed.occasion) ? parsed.occasion : ['casual'],
          style: Array.isArray(parsed.style) ? parsed.style : ['elegant'],
          maxBudget: typeof parsed.maxBudget === 'number' ? parsed.maxBudget : 0,
          intentSummary: parsed.intentSummary || message,
          aiAnalysis: parsed.aiAnalysis || ''
        };
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
