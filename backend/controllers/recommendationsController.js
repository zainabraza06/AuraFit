import { getRecommendations, getOutfitForQuery, normalizeColor } from '../services/recommendationEngine.js';
import { parseIntentWithFallback } from '../services/aiService.js';


const CANONICAL_COLORS = [
  'Black', 'White', 'Grey', 'Red', 'Pink', 'Purple',
  'Blue', 'Green', 'Teal', 'Yellow', 'Orange',
  'Gold', 'Beige', 'Brown', 'Multicolor'
];

const INTENT_PROMPT = `
You are an expert AI fashion stylist for AuraFit, a Pakistani fashion platform.
Analyze the user request and extract structured fashion intent as JSON.

Return ONLY a valid JSON object with these exact fields:
- colorExact: the EXACT color word(s) the user mentioned (e.g. "maroon", "ferozi", "navy blue"). null if no color mentioned.
- colorFamily: map colorExact to ONE canonical family from: ${CANONICAL_COLORS.join(', ')}, Any. "Any" if no color mentioned.
- occasion: array — pick all that apply from: ["casual", "wedding", "bridal", "office", "party", "eid", "formal", "mehndi"]. Empty array [] if not mentioned.
- dressStyle: ONE of ["saree", "lehenga", "frock", "maxi", "shalwar-kameez", "kurta", "co-ord", "palazzo", "western"] or null if not mentioned.
- stitching: "stitched" or "unstitched" or null if not mentioned.
- pieces: number of pieces — 1, 2, or 3. Infer from: "kurta"/"top"/"shirt" alone → 1, "2-piece"/"2 piece"/"do piece" → 2, "3-piece"/"3 piece"/"teen piece" → 3, "shalwar kameez" → 2. null if not mentioned.
- print: "embroidered" or "printed" or "plain" or "embellished" or null if not mentioned.
- gender: "women", "men", "kids", or "unisex". Default "women" if not specified.
- fabric: string (e.g. "lawn", "chiffon", "silk") or null if not mentioned.
- maxBudget: number in PKR. 0 if not mentioned.
- intentSummary: one concise sentence describing what the user wants.
- aiAnalysis: 2-3 sentences of fashion advice tailored to this request.
- constraintPriority: array of ALL specified constraints ordered from MOST important (index 0, relax last) to LEAST important (relax first). Use ONLY these names: "color","pieces","stitching","dressStyle","occasion","print","fabric". Include only constraints the user actually specified. NEVER return [] when 2 or more constraints are specified — always rank them. To rank: ask "if I removed this constraint from the search, would the result feel wrong?" — the more wrong it would feel, the higher it ranks. If the user explicitly states an order ("preferred","then","matters most"), follow that exactly. Otherwise judge from context: e.g. "lawn 3-piece unstitched" → fabric is the headline noun → ["fabric","stitching","pieces"]; "bridal lehenga embroidered red" → lehenga+bridal define the look → ["dressStyle","occasion","print","color"]; "navy blue office suit" → occasion+style are core → ["occasion","dressStyle","color","pieces"]. Return [] only when 0 or 1 constraint is specified.

IMPORTANT: Only set a field if the user explicitly mentioned it. Do NOT infer occasion from dress type — if user says "lehenga" without mentioning occasion, occasion should be [].
`;

export async function getProductRecommendations(req, res) {
  try {
    const result = await getRecommendations(req.params.productId, { maxShoes: 6, maxClothing: 6 });
    res.json({
      source:                result.source,
      shoes:                 result.shoes,
      complementaryClothing: result.complementaryClothing,
      generatedAt:           result.generatedAt
    });
  } catch (err) {
    if (err.message === 'Product not found') return res.status(404).json({ error: 'Product not found' });
    console.error('Recommendation error:', err);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
}

export async function generateOutfit(req, res) {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    let parsedIntent;
    try {
      const parsed = await parseIntentWithFallback(message, INTENT_PROMPT);

      const rawColorFamily = (parsed.colorFamily || 'Any').trim();
      parsedIntent = {
        colorExact:    (parsed.colorExact && parsed.colorExact !== 'null') ? parsed.colorExact.toLowerCase().trim() : null,
        colorFamily:   CANONICAL_COLORS.includes(rawColorFamily) ? rawColorFamily : (normalizeColor(rawColorFamily) || 'Any'),
        occasion:      Array.isArray(parsed.occasion) ? parsed.occasion : [],
        dressStyle:    (parsed.dressStyle && parsed.dressStyle !== 'null') ? parsed.dressStyle.toLowerCase().trim() : null,
        stitching:     ['stitched', 'unstitched'].includes(parsed.stitching) ? parsed.stitching : null,
        pieces:        (typeof parsed.pieces === 'number' && [1, 2, 3].includes(parsed.pieces)) ? parsed.pieces : null,
        print:         ['embroidered', 'printed', 'plain', 'embellished', 'mixed'].includes(parsed.print) ? parsed.print : null,
        gender:        ['women', 'men', 'kids', 'unisex'].includes(parsed.gender) ? parsed.gender : 'women',
        fabric:        (parsed.fabric && parsed.fabric !== 'null') ? parsed.fabric.toLowerCase().trim() : null,
        maxBudget:          typeof parsed.maxBudget === 'number' ? parsed.maxBudget : 0,
        intentSummary:      parsed.intentSummary || message,
        aiAnalysis:         parsed.aiAnalysis || '',
        constraintPriority: Array.isArray(parsed.constraintPriority)
          ? parsed.constraintPriority.filter((c) =>
              ['color','pieces','stitching','dressStyle','occasion','print','fabric'].includes(c)
            )
          : []
      };

    } catch (aiErr) {
      console.warn('Intent parsing failed, using empty intent:', aiErr.message);
      parsedIntent = {
        colorExact: null, colorFamily: 'Any',
        occasion: [], dressStyle: null,
        stitching: null, pieces: null, print: null,
        gender: 'women', fabric: null,
        maxBudget: 0,
        intentSummary: message,
        aiAnalysis: 'Parsing failed — showing broad matches.',
        constraintPriority: []
      };
    }

    // Urdu/shade alias resolution for colorFamily
    if (parsedIntent.colorExact && parsedIntent.colorFamily === 'Any') {
      const resolved = normalizeColor(parsedIntent.colorExact);
      if (resolved && CANONICAL_COLORS.includes(resolved)) {
        parsedIntent.colorFamily = resolved;
      }
    }

    parsedIntent.originalMessage = message;

    const outfit = await getOutfitForQuery(parsedIntent);

    res.json({
      intent:            parsedIntent,
      results:           outfit.results,
      matchQuality:      outfit.matchQuality,
      relaxationMessage: outfit.relaxationMessage || null
    });
  } catch (err) {
    console.error('Outfit generation error:', err);
    res.status(500).json({ error: 'Failed to generate outfit' });
  }
}
