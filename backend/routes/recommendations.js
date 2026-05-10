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

    // These are the ONLY canonical colors in our system.
    // Gemini must map any shade/variant to one of these — never invent new names.
    const CANONICAL_COLORS = [
      'Black', 'White', 'Grey', 'Red', 'Pink', 'Purple',
      'Blue', 'Green', 'Teal', 'Yellow', 'Orange',
      'Gold', 'Beige', 'Brown', 'Multicolor'
    ];

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
Analyze the user request and extract structured fashion intent as JSON.

User Request: "${message}"

Return ONLY a valid JSON object with these exact fields:

- color: (string) MUST be exactly one of these canonical colors (or "Any"):
  ${CANONICAL_COLORS.join(', ')}, Any

  Map EVERY shade or variant the user mentions to the nearest canonical color:
  • lavender, lilac, violet, mauve, plum, grape, wisteria, jamuni, baingan, purple → Purple
  • navy, sky blue, cobalt, royal blue, indigo, denim, midnight blue, baby blue, nila → Blue
  • bottle green, emerald, olive, mint, sage, pista, pistachio, dhani, sea green, forest green, army green, mehendi green → Green
  • turquoise, aqua, cyan, seafoam, ferozi, teal green → Teal
  • maroon, crimson, burgundy, wine, rust, brick red, cherry, mehroon, mehrun, surkh, dark red → Red
  • blush, rose, peach, salmon, baby pink, fuchsia, hot pink, dusty pink, nude pink, old rose, magenta, gulabi → Pink
  • ivory, cream, off-white, pearl, chalk, snow, milk white → White
  • silver, ash, charcoal, slate, smoke, steel grey, graphite, gray → Grey
  • mustard, lemon, saffron, butter, canary, pastel yellow, lemon yellow, zard, peela → Yellow
  • coral, terracotta, amber, burnt orange, apricot, pumpkin, narangi, tangerine, mango → Orange
  • golden, antique gold, champagne, bronze, dull gold → Gold
  • beige, nude, camel, fawn, khaki, khaaki, sand, oat, linen, wheat, biscuit → Beige
  • chocolate, mocha, coffee, caramel, tan, walnut, chestnut, dark brown → Brown
  • printed, multicolor, multi-color, colourful, multi → Multicolor

  For "pastel" alone: look at the rest of the message for clues; if unclear use "Any".
  If no color is mentioned at all → "Any".

- shade: (string) The EXACT color word(s) the user mentioned, before any normalization.
  Copy it verbatim from the user's message (lowercase).
  Examples: user says "ferozi" → "ferozi", user says "tangerine" → "tangerine",
  user says "blue" → "blue", user says "mustard yellow" → "mustard yellow".
  If no color was mentioned → "any".

- occasion: (array of strings) Pick all that apply from:
  ["casual", "wedding", "office", "party", "eid", "formal", "mehndi"]

- style: (array of strings) Pick all that apply from:
  ["elegant", "trendy", "minimal", "embroidered", "western", "traditional"]

- maxBudget: (number) Budget in PKR. 0 if not mentioned.

- intentSummary: (string) One concise sentence.

- aiAnalysis: (string) 2-3 sentences covering:
  1. What the user wants and why those attributes were chosen.
  2. What Pakistani outfit style fits best (lawn suit, chiffon 3-piece, kurta, etc.).
  3. A fashion tip — color pairing, accessory suggestion, or occasion advice.

Example — "I need a ferozi lawn suit for eid under 8000":
{
  "color": "Teal",
  "shade": "ferozi",
  "occasion": ["eid"],
  "style": ["elegant", "traditional"],
  "maxBudget": 8000,
  "intentSummary": "A teal lawn suit for Eid celebrations under PKR 8,000.",
  "aiAnalysis": "Ferozi (teal) is one of the most beloved Eid colors in Pakistan, offering a cool, festive look. A printed or embroidered lawn 2-piece or 3-piece would suit this budget perfectly. Pair with silver or white khussa flats and minimal jewelry for a fresh, elegant Eid look."
}
`;
        const model = ai.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        if (text.includes('```')) text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(text);

        // Validate color is canonical — fallback to alias map if Gemini slips
        const rawColor = (parsed.color || 'Any').trim();
        const isCanonical = CANONICAL_COLORS.includes(rawColor) || rawColor === 'Any';

        parsedIntent = {
          color: isCanonical ? rawColor : (CANONICAL_COLORS.find(
            c => rawColor.toLowerCase().includes(c.toLowerCase())
          ) || 'Any'),
          shade: (parsed.shade && parsed.shade !== 'any') ? parsed.shade.toLowerCase().trim() : null,
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
