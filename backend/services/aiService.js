import dotenv from 'dotenv';
import { completeJsonWithProviderFallback, parseIntentWithProviderOrder } from './llmClient.js';

dotenv.config();

/**
 * rankProductsWithAI
 * Sends up to 20 candidate products + the user's intent to Gemini.
 * Gemini reads each description and returns a ranked list with a reason per product.
 * Falls back to original order if AI call fails.
 */
export async function rankProductsWithAI(products, intent) {
  if (!products.length) return [];

  const productList = products
    .map((p, i) =>
      `[${i + 1}] "${p.name}" by ${p.brand}
  Price: PKR ${p.price}
  Color: ${p.primaryExactColor || p.primaryColor || 'N/A'}
  Occasion: ${(p.occasion || []).join(', ') || 'N/A'}
  Dress style: ${p.dressStyle || p.subCategory || 'N/A'}
  Print/Work: ${p.print || p.pattern || 'N/A'}
  Stitching: ${p.stitching || p.stitchedType || 'N/A'}
  Fabric: ${p.fabric || 'N/A'}
  Description: ${(p.description || '').slice(0, 2000)}`
    )
    .join('\n\n');

  const specifiedParts = [
    intent.colorExact   ? `Color: ${intent.colorExact}`        : null,
    intent.colorFamily && intent.colorFamily !== 'Any' ? `Color family: ${intent.colorFamily}` : null,
    intent.occasion?.length ? `Occasion: ${intent.occasion.join(', ')}` : null,
    intent.season ? `Season: ${intent.season}` : null,
    intent.dressStyle   ? `Dress style: ${intent.dressStyle}`  : null,
    intent.print        ? `Print/Work: ${intent.print}`        : null,
    intent.stitching    ? `Stitching: ${intent.stitching}`     : null,
    intent.fabric       ? `Fabric: ${intent.fabric}`           : null,
    intent.maxBudget > 0 ? `Budget: PKR ${intent.maxBudget}`  : null,
  ].filter(Boolean).join('\n  ');

  const priorityNote = intent.constraintPriority?.length
    ? `\nUser priority (most → least important): ${intent.constraintPriority.join(' > ')}. Weight matches on earlier items MORE heavily in your ranking.`
    : '';

  const prompt = `You are AuraFit's AI fashion ranker for Pakistani women's fashion.

User asked for: "${intent.originalMessage || intent.intentSummary}"

What the user wants:
  ${specifiedParts || 'General browsing — rank by overall quality and appeal'}${priorityNote}

Rank the ${products.length} products below from BEST (rank 1) to WORST match. Read each description carefully — the description often contains details (fabric drape, embellishment weight, neckline/sleeves, work density, lining, season) not present in the other fields. Give a concise, specific reason for each ranking (one sentence, mention what matched or what's slightly off).

Apply world-standard fashion styling protocol when the user's request leaves room for judgement — infer these cues from the DESCRIPTION, not just the tags:
  • Occasion & formality: heavy embroidery / zari / embellished fabrics (organza, net, velvet, jamawar) suit weddings, mehndi, parties & Eid; lawn / cotton / cambric with light or no work suit casual & daytime; structured, minimal pieces suit office/formal.
  • Season & fabric: lawn, cotton, cambric, chiffon → summer; velvet, khaddar, linen, wool, jacquard → winter. Penalise season-inappropriate fabrics when the user named a season.
  • Colour theory: for a stated occasion, favour tonal harmony and classic Pakistani wedding palettes (maroon, deep red, bottle green, royal blue, gold) for bridal/festive; pastels & neutrals for daytime; avoid clashing loud combinations.
  • Silhouette & completeness: complete, well-proportioned outfits rank above single pieces.
IMPORTANT: If the user asked for a specific garment type (suit, lehenga, frock, maxi etc.), rank complete outfits of that type at the top. Rank dupattas, scarves, individual pieces, or accessories very low even if other attributes match.

${productList}

Return ONLY valid JSON — no markdown, no explanation:
{
  "catalogNote": "1-2 honest sentences if there is a meaningful gap between what the user requested and what is actually available in these results — be specific about the attribute that differs (e.g. wrong garment type, unavailable print/work, color mismatch, piece count off). Set to null if the top results are a good overall match.",
  "rankings": [
    { "productIndex": 0, "rank": 1, "reason": "Exact maroon embroidered lehenga, perfect for a wedding occasion and within budget" },
    { "productIndex": 2, "rank": 2, "reason": "..." }
  ]
}

productIndex is 0-based (0 = first product listed above). Include all ${products.length} products.`;

  function parseRankings(text) {
    if (text.includes('```')) text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(extractJson(text));
    const rankings = parsed.rankings
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ product: products[r.productIndex], rank: r.rank, reason: r.reason }))
      .filter((r) => r.product != null);
    const catalogNote =
      typeof parsed.catalogNote === 'string' && parsed.catalogNote.trim()
        ? parsed.catalogNote.trim()
        : null;
    return { rankings, catalogNote };
  }

  try {
    const { text, provider } = await completeJsonWithProviderFallback({
      system:
        'You are AuraFit\'s fashion ranker. Output a single valid JSON object exactly as requested. No markdown, no commentary.',
      user: prompt,
      temperature: 0.2
    });
    console.log(`[rankProductsWithAI] ranked via ${provider}`);
    return parseRankings(text);
  } catch (err) {
    console.warn('[rankProductsWithAI] All providers exhausted:', err.message);
  }

  return { rankings: products.map((p, i) => ({ product: p, rank: i + 1, reason: null })), catalogNote: null };
}

/**
 * planNextRelaxation — the agentic step decision.
 * Given the user's request, what's still filtered, and the ACTUAL catalog counts
 * for each possible next move, the LLM decides ONE honest next action.
 * @returns {{action:'relax'|'accept'|'raise_budget'|'stop', constraint?:string, message:string}}
 */
export async function planNextRelaxation(ctx) {
  const relaxLines = Object.entries(ctx.relaxOptions || {})
    .map(([k, v]) => `  - drop "${k}" → ${v} results`)
    .join('\n') || '  (no further constraints to relax)';

  const user = `Shopper asked: "${ctx.message}"
Active filters (all applied now): ${ctx.active.join(', ') || 'none'}
Already relaxed this session: ${ctx.dropped.join(', ') || 'none'}
Budget ceiling: ${ctx.maxBudget ? 'PKR ' + ctx.maxBudget : 'none'}

Right now, ${ctx.current} products match ALL active filters${ctx.maxBudget ? ' within budget' : ''}.
If I relax ONE more filter, the count becomes:
${relaxLines}
${ctx.maxBudget ? `Keeping all current filters but LIFTING the budget ceiling → ${ctx.budgetLift} results (cheapest PKR ${ctx.cheapest ?? 'n/a'}).` : ''}

Decide the single best next action so the shopper gets the closest honest match:
- "accept": current results are already enough (aim for ≈8+) or the best achievable — stop and show them.
- "relax": drop ONE named filter (choose the LEAST important to this shopper; keep what they clearly care about). Return it in "constraint".
- "raise_budget": good matches exist ONLY above the budget — never show over-budget silently; tell them to raise it.
- "stop": nothing reasonable exists even relaxed — say so honestly.
Return JSON only: {"action":"...","constraint":"<if relax>","message":"<one honest sentence to the shopper about what you did and why>"}`;

  try {
    const { text } = await completeJsonWithProviderFallback({
      system: 'You are AuraFit\'s honest retrieval planner. Output one JSON object only.',
      user,
      temperature: 0.1
    });
    const p = JSON.parse(extractJson(text));
    const action = ['relax', 'accept', 'raise_budget', 'stop'].includes(p.action) ? p.action : 'accept';
    return { action, constraint: p.constraint || null, message: typeof p.message === 'string' ? p.message.trim() : '' };
  } catch (e) {
    console.warn('[planNextRelaxation] failed:', e.message);
    return null; // caller falls back to deterministic relaxation
  }
}

const VALID_DRESS_STYLES = ['saree','lehenga','frock','maxi','shalwar-kameez','kurta','co-ord','palazzo','western'];

/**
 * mapDressStyleWithAI
 * For unknown dressStyle terms not in the static alias map, ask the LLM
 * to map them to a canonical value. Returns null if no mapping exists.
 */
export async function mapDressStyleWithAI(term) {
  const user = `You are a Pakistani fashion expert. Map the garment term "${term}" to EXACTLY ONE value from this list: ${VALID_DRESS_STYLES.join(', ')}. Return ONLY a JSON object like {"dressStyle":"shalwar-kameez"} or {"dressStyle":null} if it does not fit any category.`;

  try {
    const { text } = await completeJsonWithProviderFallback({
      system: 'Reply with JSON only.',
      user,
      temperature: 0
    });
    const parsed = JSON.parse(extractJson(text));
    const mapped = parsed?.dressStyle?.toLowerCase?.().trim();
    return VALID_DRESS_STYLES.includes(mapped) ? mapped : null;
  } catch {
    return null;
  }
}

/**
 * generatePersonalStyleAdvice
 * The user describes themselves (body type, skin tone, height, age — whatever
 * they choose to share) plus the occasion. Blends GLOBAL fashion principles
 * (color theory for skin undertone, silhouettes that flatter different body
 * shapes, proportion balancing) with PAKISTANI TRADITIONAL standards (which
 * garment fits which occasion, modesty/coverage norms, seasonal fabric
 * choices, traditional occasion color associations) into genuine styling
 * advice, then distills that into a clean search prompt the app's existing
 * outfit engine can run directly — no separate "person description" field
 * needed in the catalog/search layer, this just produces a good query for it.
 */
export async function generatePersonalStyleAdvice(userMessage) {
  const system = `You are an expert fashion stylist for AuraFit, a Pakistani women's fashion platform.
Combine two knowledge sources when advising:
  1. GLOBAL fashion principles — color theory relative to skin undertone (warm/cool/neutral), silhouettes
     that flatter different body shapes (pear, apple, hourglass, rectangle, inverted-triangle), and
     proportion balancing (e.g. A-line to balance a fuller lower body, structured shoulders to balance
     a pear shape, empire waists to elongate a shorter torso).
  2. PAKISTANI TRADITIONAL standards — which garment suits which occasion (shalwar-kameez, lehenga,
     saree, gharara, sharara, kurta, abaya), modesty/coverage norms for weddings/eid/mehndi/religious
     contexts, seasonal fabric choices (lawn/chiffon/cotton for summer, khaddar/velvet/wool for winter),
     and traditional occasion color associations (bridal reds/maroons/deep greens/gold, mehndi
     yellows/greens/oranges, eid pastels/brights, funeral/somber events → white/muted tones).

The user will describe themselves and the occasion in their own words — details may be partial or
entirely absent (e.g. they might only give the occasion, or only a body type). Give the best specific
advice possible with whatever is provided; never refuse or demand more information.

Return ONLY a JSON object:
{
  "advice": "2-4 sentences of SPECIFIC styling advice — name actual colors, silhouettes, and garment
             types, and briefly explain WHY (skin tone / body shape / occasion reasoning). Warm,
             confident, stylist tone — not generic.",
  "searchPrompt": "ONE natural-language sentence formatted exactly like a normal outfit search query
                  our catalog engine can run directly — e.g. 'emerald green 3-piece embroidered
                  lehenga for wedding' or 'pastel pink unstitched 2-piece for eid under 8000'.
                  Include color, garment/dress style, and occasion at minimum; include piece count,
                  fabric, or budget ONLY if the user mentioned or implied them. MUST commit to ONE
                  specific color and ONE specific garment style — never write alternatives like
                  'yellow or green' or 'lehenga or gharara'; the advice text can mention options,
                  but searchPrompt is a single decisive query, not a choice.
                  The garment word in searchPrompt MUST be one of: kurta, shalwar-kameez, western,
                  lehenga, co-ord, abaya, saree — these are the catalog styles with real inventory.
                  STRONGLY PREFER shalwar-kameez or kurta (the catalog's largest categories) whenever
                  the occasion reasonably allows it — this is what most Pakistani formal/casual wear
                  actually is. Reserve 'lehenga' for genuinely bridal/heavy-festive looks only. Do NOT
                  use frock, maxi, gown, tunic, palazzo, or sherwani in searchPrompt — the catalog has
                  zero or almost zero items in these categories, so a search for them reliably returns
                  nothing. The advice text is free to use authentic regional terms (sharara, gharara,
                  anarkali, etc.) since that reads naturally to the user, but map them to a real
                  catalog term for searchPrompt: sharara/gharara/anarkali → shalwar-kameez (or lehenga
                  only if genuinely bridal), angrakha → kurta. Never put an unsupported term (sharara,
                  gharara, anarkali, frock, maxi, gown, etc.) directly in searchPrompt.",
  "dressStyle": "the catalog garment-type word actually used in searchPrompt, e.g. 'lehenga' or 'shalwar-kameez'",
  "occasion": "the occasion as stated or inferred, e.g. 'wedding'"
}`;

  try {
    const { text } = await completeJsonWithProviderFallback({ system, user: userMessage, temperature: 0.4 });
    const parsed = JSON.parse(extractJson(text));
    if (!parsed?.advice || !parsed?.searchPrompt) throw new Error('Incomplete style advice response');
    return {
      advice: String(parsed.advice).trim(),
      searchPrompt: stripAlternatives(String(parsed.searchPrompt).trim()),
      dressStyle: parsed.dressStyle ? String(parsed.dressStyle).trim() : null,
      occasion: parsed.occasion ? String(parsed.occasion).trim() : null
    };
  } catch (e) {
    console.warn('[generatePersonalStyleAdvice] failed:', e.message);
    throw new Error('Could not generate styling advice right now — please try again.');
  }
}

/**
 * Intent parsing — OpenRouter → Groq → Gemini 1.5 → Gemini 2.5
 */
export const parseIntentWithFallback = async (message, prompt) => parseIntentWithProviderOrder(message, prompt);

/**
 * Defensive cleanup for generatePersonalStyleAdvice's searchPrompt: the LLM is
 * instructed to commit to one option, but occasionally still writes "navy blue
 * or soft lavender ..." anyway. A compound "X or Y" query confuses the intent
 * parser (which color should it filter on?). Keep only the first alternative.
 * Anchored to a known "next token" (fabric/style word, piece-count, garment
 * noun, or "for") immediately after the second alternative — this is what
 * makes it safe to apply broadly: without the anchor, a naive "first `or`"
 * match over-consumes unrelated later words (tested and rejected — e.g. it
 * corrupted "pastel pink or mint green 3-piece" into "pink-piece").
 */
function stripAlternatives(text) {
  const anchorWords = ['tailored', 'structured', 'embroidered', 'plain', 'printed', 'unstitched', 'stitched',
    'velvet', 'chiffon', 'lawn', 'cotton', 'silk', 'kurta', 'shalwar-kameez', 'lehenga', 'saree', 'abaya', 'western', 'co-ord'];
  const anchor = `(?:${anchorWords.join('|')}|for\\s|\\d+-piece)`;
  const re = new RegExp(`\\b(\\w+(?:\\s\\w+)?)\\s+or\\s+(\\w+(?:\\s\\w+)?)\\s+(?=${anchor})`, 'i');
  return text.replace(re, '$1 ').replace(/\s+/g, ' ').trim();
}

/**
 * Utility: Robust JSON extraction from LLM response
 */
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return text;
  return text.substring(start, end + 1);
}
