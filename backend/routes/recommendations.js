/**
 * recommendations.js — AI Recommendation API
 * GET  /api/recommendations/:productId  — outfit recs for a product page
 * POST /api/recommendations/outfit      — chat-based outfit from intent
 */

import express from 'express';
import { getRecommendations, getOutfitForQuery, normalizeColor } from '../services/recommendationEngine.js';
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
- shade: The EXACT color word(s) the user mentioned (e.g. "navy", "maroon", "ferozi"). null if none.
- occasion: Array from: ["casual", "wedding", "bridal", "office", "party", "eid", "formal", "mehndi"]. Map "bridal" queries to ["wedding","bridal"]. Map fashion/fancy/festive to ["party","eid"].
- style: Array from: ["elegant", "trendy", "minimal", "embroidered", "western", "traditional", "heavy"]
- gender: "women", "men", "kids", or "unisex". Default "women" if not specified.
- dressType: "bridal", "formal", "casual", "party", "western", "festive" or null.
- piece: String describing piece count/type (e.g., "2-piece", "3-piece", "kurta", "bridal lehenga") or null.
- pieces: Number — 1, 2, or 3. Infer from piece field. null if unknown.
- fabric: String (e.g., "lawn", "chiffon", "silk", "velvet") or null.
- stitching: "stitched", "unstitched", or null.
- maxBudget: Number (PKR). 0 if not mentioned.
- intentSummary: One concise sentence describing the request.
- aiAnalysis: 2-3 sentences of fashion advice tailored to the request.
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
        shade: (parsed.shade && parsed.shade !== 'any' && parsed.shade !== 'null') ? parsed.shade.toLowerCase().trim() : null,
        fabric: (parsed.fabric && parsed.fabric !== 'null') ? parsed.fabric.toLowerCase().trim() : null,
        piece: (parsed.piece && parsed.piece !== 'null') ? parsed.piece.toLowerCase().trim() : null,
        pieces: (typeof parsed.pieces === 'number' && parsed.pieces >= 1 && parsed.pieces <= 3) ? parsed.pieces : null,
        stitching: (parsed.stitching && parsed.stitching !== 'null') ? parsed.stitching.toLowerCase().trim() : null,
        gender: ['women', 'men', 'kids', 'unisex'].includes(parsed.gender) ? parsed.gender : 'women',
        dressType: (parsed.dressType && parsed.dressType !== 'null') ? parsed.dressType.toLowerCase().trim() : null,
        occasion: Array.isArray(parsed.occasion) ? parsed.occasion : ['casual'],
        style: Array.isArray(parsed.style) ? parsed.style : ['elegant'],
        maxBudget: typeof parsed.maxBudget === 'number' ? parsed.maxBudget : 0,
        intentSummary: parsed.intentSummary || message,
        aiAnalysis: parsed.aiAnalysis || ''
      };
    } catch (aiErr) {
      console.warn('All AI intent parsing failed, using default fallback:', aiErr.message);
      parsedIntent = {
        color: 'Any', shade: null,
        gender: 'women', dressType: null,
        occasion: ['casual'], style: ['elegant'],
        piece: null, pieces: null, fabric: null, stitching: null,
        maxBudget: 0,
        intentSummary: message,
        aiAnalysis: 'Parsing failed, showing broad matches.'
      };
    }

    // Resolve Pakistani/Urdu color aliases the AI may have missed.
    // e.g. Groq returns color='Any' shade='maroon' → we resolve maroon→Red
    // or color='Multicolor' shade='ferozi' → we resolve ferozi→Teal
    if (parsedIntent.shade) {
      const resolved = normalizeColor(parsedIntent.shade);
      const capitalizedShade = parsedIntent.shade.charAt(0).toUpperCase() + parsedIntent.shade.slice(1);
      if (resolved !== capitalizedShade && CANONICAL_COLORS.includes(resolved)) {
        parsedIntent.color = resolved;
      }
    }

    parsedIntent.originalMessage = message;
    const outfit = await getOutfitForQuery(parsedIntent);
    res.json({
      intent: parsedIntent,
      outfit,
      ...(outfit.colorMessage ? { colorMessage: outfit.colorMessage } : {})
    });
  } catch (err) {
    console.error('Outfit generation error:', err);
    res.status(500).json({ error: 'Failed to generate outfit' });
  }
});

export default router;
