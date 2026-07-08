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
 * rankShoesWithAI
 * Given one dress and a pre-filtered candidate shoe pool (already scored by
 * accessoryMatcher.js's footwearFashionScore, so silhouette-mismatched shoes
 * like sneakers-for-eastern-wear are already deprioritized), asks the LLM to
 * pick the best N and explain each choice against REAL global + Pakistani
 * fashion pairing standards — replacing the templated "color harmony" string
 * with a genuine, specific reason. Falls back to the pre-filtered order (with
 * a null reason) if all providers fail, same pattern as rankProductsWithAI.
 */
export async function rankShoesWithAI(dress, candidates, maxPicks = 6) {
  if (!candidates.length) return [];

  const shoeList = candidates
    .map((s, i) => `[${i}] "${s.name}" — type: ${s.shoeType || 'N/A'}, color: ${s.primaryColor || 'N/A'}, occasion: ${(s.occasion || []).join(', ') || 'N/A'}`)
    .join('\n');

  const prompt = `You are AuraFit's footwear stylist for Pakistani women's fashion.

The outfit: "${dress.name}" — dress style: ${dress.dressStyle || dress.subCategory || 'N/A'}, color: ${dress.primaryColor || 'N/A'}, occasion: ${(dress.occasion || []).join(', ') || 'N/A'}.

Candidate shoes:
${shoeList}

Pick the best ${Math.min(maxPicks, candidates.length)} shoes for this specific outfit, applying REAL global + Pakistani fashion pairing standards:
  • Eastern traditional silhouettes (shalwar-kameez, kurta, lehenga, saree, abaya, sherwani) pair with khussa, kolhapuri, sandals, wedges, mules, or dressy flats — NEVER Western athletic shoes (sneakers, trainers, joggers), regardless of how "casual" the occasion is. A casual unstitched lawn suit still calls for a casual eastern sandal or khussa, not a sneaker.
  • Western wear (co-ord, western dresses, jeans-style pieces) can genuinely pair with sneakers, flats, loafers, or heels depending on formality.
  • Bridal/wedding/formal occasions favor heels, khussa, or mules — never sneakers/flats/joggers.
  • Color harmony and occasion tags matter, but silhouette-appropriateness above is the deciding factor when they conflict.

Return ONLY valid JSON:
{
  "picks": [
    { "shoeIndex": 0, "reason": "one specific sentence grounded in the actual pairing logic above" }
  ]
}
shoeIndex is 0-based. Order picks BEST first. Include at most ${Math.min(maxPicks, candidates.length)}.`;

  try {
    const { text, provider } = await completeJsonWithProviderFallback({
      system: 'You are AuraFit\'s footwear stylist. Output a single valid JSON object exactly as requested. No markdown, no commentary.',
      user: prompt,
      temperature: 0.2
    });
    console.log(`[rankShoesWithAI] ranked via ${provider}`);
    const parsed = JSON.parse(extractJson(text));
    const picks = (parsed.picks || [])
      .map((p) => ({ product: candidates[p.shoeIndex], reason: typeof p.reason === 'string' ? p.reason.trim() : null }))
      .filter((p) => p.product != null);
    return picks.length ? picks : null;
  } catch (err) {
    console.warn('[rankShoesWithAI] All providers exhausted:', err.message);
    return null;
  }
}

/**
 * rankComplementaryClothingWithAI
 * Given the product-page source garment and a pre-filtered candidate pool
 * (already scored by the deterministic scoreProduct() heuristic — embedding
 * similarity + color/occasion/style overlap), asks the LLM to pick the best N
 * and explain each as a genuine styling/coordination choice — e.g. "pairs as a
 * matching bottom", "same occasion tier, complementary accent color", "similar
 * silhouette for a mix-and-match wardrobe" — rather than a bare percentage.
 * Falls back to the pre-filtered order (no reason) if all providers fail.
 */
export async function rankComplementaryClothingWithAI(source, candidates, maxPicks = 6) {
  if (!candidates.length) return [];

  const list = candidates
    .map((c, i) => `[${i}] "${c.name}" — style: ${c.dressStyle || c.subCategory || 'N/A'}, color: ${c.primaryColor || 'N/A'}, occasion: ${(c.occasion || []).join(', ') || 'N/A'}, fabric: ${c.fabric || 'N/A'}`)
    .join('\n');

  const prompt = `You are AuraFit's fashion stylist for Pakistani women's fashion, picking "Complementary Styles" for a shopper viewing this item:

"${source.name}" — dress style: ${source.dressStyle || source.subCategory || 'N/A'}, color: ${source.primaryColor || 'N/A'}, occasion: ${(source.occasion || []).join(', ') || 'N/A'}, fabric: ${source.fabric || 'N/A'}.

Candidate pieces:
${list}

Pick the best ${Math.min(maxPicks, candidates.length)} pieces that genuinely complement or coordinate with this item — same occasion tier and formality level, a harmonious (not clashing) color relationship, and a style/silhouette a real stylist would suggest pairing or wearing on a similar occasion. Apply real global + Pakistani fashion standards: don't suggest a heavily bridal-embellished piece alongside a plain casual lawn suit, don't mix mismatched formality levels, and favor genuine color harmony over a same-hue coincidence.

Return ONLY valid JSON:
{
  "picks": [
    { "productIndex": 0, "reason": "one specific sentence about why this coordinates well" }
  ]
}
productIndex is 0-based. Order picks BEST first. Include at most ${Math.min(maxPicks, candidates.length)}.`;

  try {
    const { text, provider } = await completeJsonWithProviderFallback({
      system: 'You are AuraFit\'s fashion stylist. Output a single valid JSON object exactly as requested. No markdown, no commentary.',
      user: prompt,
      temperature: 0.2
    });
    console.log(`[rankComplementaryClothingWithAI] ranked via ${provider}`);
    const parsed = JSON.parse(extractJson(text));
    const picks = (parsed.picks || [])
      .map((p) => ({ product: candidates[p.productIndex], reason: typeof p.reason === 'string' ? p.reason.trim() : null }))
      .filter((p) => p.product != null);
    return picks.length ? picks : null;
  } catch (err) {
    console.warn('[rankComplementaryClothingWithAI] All providers exhausted:', err.message);
    return null;
  }
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

Decide your styling recommendation in two steps:
  STEP 1 — What garment would be IDEAL here, purely by global/traditional styling logic, COMPLETELY
    ignoring what our catalog stocks? Answer this as a real stylist would, with zero regard for
    inventory. Get specific, well-known occasion norms right — do not default to shalwar-kameez as a
    generic safe answer. Known examples where shalwar-kameez is NOT the norm:
      • University/college farewell parties in Pakistan — students overwhelmingly wear sarees, maxis,
        or long Western-style gowns, not shalwar-kameez; this is a well-established, photographed
        tradition, not a niche choice.
      • Red carpet / award-show style events — Western gowns.
      • Garden parties / high tea — maxis or flowy Western dresses are common alongside eastern wear.
      • Corporate/university/school "annual dinner" or annual function galas — these are semi-formal
        evening events, NOT bridal-adjacent. The norm is an elegant saree, a fitted/flowy Western gown
        or dress, or a refined 2-piece — NOT a heavily embroidered bridal-style lehenga, which reads as
        overdressed here. Reserve lehenga recommendations for actual weddings, mehndi, or similarly
        bridal/festive functions the user explicitly names.
    Shalwar-kameez/kurta ARE the right call for everyday wear, office, casual outings, and many
    religious/family occasions (eid namaz, mehndi in some families, casual get-togethers) — use them
    there. The point is to be accurate to the specific occasion, not to lean any particular direction.
  STEP 2 — SEPARATELY, now map Step 1's ideal to what's actually searchable. Our catalog ONLY has
    real inventory in: kurta, shalwar-kameez, western, lehenga, co-ord, abaya, saree (shalwar-kameez
    and kurta are by far the largest). It has ZERO or almost zero items in: frock, maxi, gown, tunic,
    palazzo, sherwani, and doesn't carry sharara/gharara/anarkali as a distinct category (those map
    into shalwar-kameez in our stock). If your Step 1 ideal falls in the unavailable list, note that
    honestly via idealStyleNotAvailable and pivot searchPrompt to the closest available style (maxi/
    gown/long frock → "western" or "saree" if it's a draped look; sharara/gharara/anarkali →
    "shalwar-kameez"; genuinely bridal looks → "lehenga"). NEVER let this catalog constraint change
    what you said in Step 1 — a thin category (e.g. saree has few listings) still gets recommended
    honestly in the advice text if it's the real answer; the catalog limitation only affects
    searchPrompt/dressStyle and triggers the disclosure note.

Return ONLY a JSON object:
{
  "advice": "2-4 sentences of SPECIFIC styling advice — name actual colors, silhouettes, and garment
             types, and briefly explain WHY (skin tone / body shape / occasion reasoning). Warm,
             confident, stylist tone — not generic. Do NOT mention catalog availability here — that
             disclosure is added separately from idealStyleNotAvailable below.",
  "searchPrompt": "ONE natural-language sentence formatted exactly like a normal outfit search query
                  our catalog engine can run directly — e.g. 'emerald green 3-piece embroidered
                  lehenga for wedding' or 'pastel pink unstitched 2-piece for eid under 8000'.
                  Include color, garment/dress style, and occasion at minimum; include piece count,
                  fabric, or budget ONLY if the user mentioned or implied them. MUST commit to ONE
                  specific color and ONE specific garment style — never write alternatives like
                  'yellow or green' or 'lehenga or gharara'; the advice text can mention options,
                  but searchPrompt is a single decisive query, not a choice.
                  If a specific neckline/shoulder style genuinely flatters the body shape or proportions
                  the user described (e.g. boat-neck to visually broaden narrow shoulders, off-shoulder
                  or sweetheart to soften a pear shape, V-neck to elongate a shorter neck/torso, square
                  neck for an hourglass), name that reasoning in the advice AND include the neckline word
                  directly in searchPrompt too (one of: round neck, v-neck, boat neck, collar neck,
                  keyhole neck, halter neck, square neck, off-shoulder) — e.g. 'boat neck emerald green
                  lehenga for wedding'. Only include a neckline word when it's a genuine styling reason
                  tied to what the user described, never as decoration.
                  The garment word in searchPrompt MUST be one of: kurta, shalwar-kameez, western,
                  lehenga, co-ord, abaya, saree — your Step 2 pivoted style, never the Step 1 ideal
                  if that one is unavailable. Never put sharara, gharara, anarkali, frock, maxi, gown,
                  tunic, palazzo, or sherwani directly in searchPrompt.",
  "dressStyle": "the catalog garment-type word actually used in searchPrompt, e.g. 'lehenga' or 'shalwar-kameez'",
  "occasion": "the occasion as stated or inferred, e.g. 'wedding'",
  "idealStyleNotAvailable": "the Step 1 ideal garment name (e.g. 'maxi dress', 'anarkali', 'gharara')
                            ONLY if it differs from your Step 2 pivoted style because we don't stock
                            it. Set to null if your ideal recommendation was already one of the
                            available styles (kurta, shalwar-kameez, western, lehenga, co-ord, abaya, saree)."
}`;

  try {
    const { text } = await completeJsonWithProviderFallback({ system, user: userMessage, temperature: 0.4 });
    const parsed = JSON.parse(extractJson(text));
    if (!parsed?.advice || !parsed?.searchPrompt) throw new Error('Incomplete style advice response');
    const dressStyle = parsed.dressStyle ? String(parsed.dressStyle).trim() : null;
    let advice = String(parsed.advice).trim();

    // Guarantee the disclosure happens even if the AI's own prose forgot to
    // mention it — same "don't trust prose alone" principle used elsewhere
    // (e.g. describeMatch() fact-checking AI-written match reasons).
    const idealUnavailable = parsed.idealStyleNotAvailable ? String(parsed.idealStyleNotAvailable).trim() : null;
    if (idealUnavailable && idealUnavailable.toLowerCase() !== 'null') {
      const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
      advice += ` (Note: ${article(idealUnavailable)} ${idealUnavailable} would suit this look too, but that style isn't currently available from our partner brands — I've adapted the recommendation to ${article(dressStyle || 'similar')} ${dressStyle || 'similar'} instead, which achieves a comparable effect.)`;
    }

    return {
      advice,
      searchPrompt: stripUnavailableGarmentWords(stripRegionalQualifiers(stripAlternatives(String(parsed.searchPrompt).trim())), dressStyle),
      dressStyle,
      occasion: parsed.occasion ? String(parsed.occasion).trim() : null,
      idealStyleNotAvailable: idealUnavailable && idealUnavailable.toLowerCase() !== 'null' ? idealUnavailable : null
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
 * Defensive cleanup: despite the prompt saying "never put sharara/gharara/
 * anarkali/etc. in searchPrompt", the LLM occasionally still tacks one on as a
 * decorative qualifier ("anarkali-style shalwar-kameez", "sharara-style
 * shalwar-kameez"). Harmless to search (dressStyle still resolves to the real
 * noun) but noisy — strip these regional-term qualifiers so the query reads clean.
 */
function stripRegionalQualifiers(text) {
  return text
    .replace(/\b(sharara|gharara|anarkali|angrakha)(-style)?\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Defensive cleanup: the LLM is told "never put maxi/gown/frock/tunic/palazzo/
 * sherwani directly in searchPrompt", but when Step 1's genuine ideal is one of
 * these (e.g. a farewell-party maxi), it sometimes still writes the real word
 * into searchPrompt even after correctly pivoting dressStyle to a catalog term
 * like "western". A searchPrompt containing "maxi dress" can get re-matched to
 * the (empty) maxi category downstream, silently zeroing out results — so swap
 * any leaked unavailable-category noun for the actual pivoted dressStyle.
 */
function stripUnavailableGarmentWords(text, dressStyle) {
  if (!dressStyle) return text;
  const banned = ['maxi dress', 'maxi', 'gown', 'long frock', 'frock', 'tunic', 'palazzo', 'sherwani'];
  let out = text;
  for (const word of banned) {
    out = out.replace(new RegExp(`\\b${word}\\b`, 'gi'), dressStyle);
  }
  // A phrase like "western gown" was already catalog-safe (dressStyle=western
  // qualifying a banned word) — replacing "gown" above leaves "western western".
  // Collapse any immediately-repeated word (case-insensitive) back to one.
  out = out.replace(/\b(\w+)(\s+\1)+\b/gi, '$1');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Utility: Robust JSON extraction from LLM response.
 *
 * The naive "first { to last }" approach breaks whenever a provider emits
 * MORE than one brace-containing block in the same response — a retry, a
 * dangling second attempt, trailing commentary with its own braces, etc.
 * lastIndexOf('}') then grabs the end of that unrelated second block, and
 * JSON.parse can silently succeed on the hybrid text with a corrupted/
 * truncated string value (this is what produced a stylist "advice" string
 * that trailed off mid-word into fragments of a second, unrelated block).
 *
 * This instead finds the FIRST balanced {...} object by tracking brace depth,
 * correctly skipping over braces that appear inside string literals (so a
 * garment description containing "{" would never happen, but this is cheap
 * insurance) — and stops at the true end of that first well-formed object,
 * ignoring anything a provider appends afterward.
 */
function extractJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return text;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }
  // No balanced close found — fall back to the old (best-effort) behavior.
  const end = text.lastIndexOf('}');
  return end === -1 ? text : text.substring(start, end + 1);
}
