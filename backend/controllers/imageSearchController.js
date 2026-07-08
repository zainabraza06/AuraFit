import { analyzeImageWithProviderFallback } from '../services/llmClient.js';
import { analyzeSearchQuery, buildSemanticQueryText } from '../services/searchQueryIntel.js';
import { getEmbedding, searchAcrossCatalogs, regexSearchAcrossCatalogs, cosineSimilarity } from '../services/crossCatalogSearch.js';
import { agenticRelax } from '../services/recommendationEngine.js';
import { parseRefinementFeedback } from '../services/intentAdapter.js';
import { inferColors } from '../scripts/scrapers/utils/colorInference.js';

/**
 * The photo shows exactly ONE item, so its matches should come from exactly ONE
 * catalog. Without this, a saree/kurta photo's embedding can score competitively
 * against gold/bridal jewelry or shoes (shared color + occasion words), letting
 * accessories leak into "top matches" for a plain clothing photo.
 */
const SHOE_WORDS = /\b(shoe|heel|pump|stiletto|sandal|chappal|sneaker|trainer|jogger|boot|loafer|flat|wedge|mule|slipper|khussa|kolhapuri|peshawari|oxford|clog|espadrille)s?\b/i;
const JEWELRY_WORDS = /\b(earring|jhumka|chandbali|necklace|choker|mala|pendant|bracelet|bangle|kada|ring|nose[- ]?pin|nath|tikka|jhoomar|passa|anklet|payal|brooch|cufflink|jewel(?:le)?ry)s?\b/i;
const WATCH_WORDS = /\b(watch|wristwatch|chronograph|smartwatch)(?:es)?\b/i;

function classifyCatalog(analysis) {
  const text = `${analysis.category} ${(analysis.keywords || []).join(' ')}`;
  if (SHOE_WORDS.test(text)) return 'shoes';
  if (JEWELRY_WORDS.test(text)) return 'jewelry';
  if (WATCH_WORDS.test(text)) return 'watches';
  return 'clothing';
}

/**
 * Vision models don't always honor "return a plain string" instructions — some
 * (Pixtral in particular) occasionally nest a field as { name, hex, ... }. Flatten
 * whatever comes back into readable text instead of letting "[object Object]"
 * leak into the description, the DB query, or the UI.
 */
function coerceToText(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val.replace(/[_-]+/g, ' ').trim();
  if (Array.isArray(val)) return val.map(coerceToText).filter(Boolean).join(', ');
  if (typeof val === 'object') {
    const candidate = val.name ?? val.value ?? val.color ?? val.label ?? val.primary ?? Object.values(val)[0];
    return candidate ? coerceToText(candidate) : '';
  }
  return String(val);
}

/** Normalizes every field of the raw vision-model JSON to plain strings/arrays. */
function normalizeAnalysis(raw) {
  return {
    category: coerceToText(raw?.category),
    color: coerceToText(raw?.color),
    style: coerceToText(raw?.style),
    occasion: coerceToText(raw?.occasion),
    keywords: Array.isArray(raw?.keywords) ? raw.keywords.map(coerceToText).filter(Boolean) : []
  };
}

/**
 * Vision models often describe color richly ("off white with red, green, and
 * gold embroidery accents") rather than as clean base shades — great for
 * display, but it corrupts search: a compound run-on sentence lets stray words
 * like "red"/"green" (describing embroidery THREAD, not the garment itself)
 * hijack both the facet color-match and the sentence embedding, pulling in
 * wrongly-colored products almost as high as the correctly-colored ones.
 *
 * A garment CAN legitimately have two real colors (a white top with teal
 * color-blocking, e.g.) — so this doesn't collapse to one shade. It extracts
 * every DISTINCT recognized color family present (via the same shade
 * vocabulary used for catalog color inference) and keeps up to 2, which
 * naturally drops one-off embroidery-thread mentions in favor of the shades
 * that actually describe the garment's overall palette.
 */
function extractColorsForSearch(colorText) {
  const { exactColors, primaryExactColor } = inferColors(colorText);
  if (primaryExactColor === 'multicolor') return [];
  return exactColors.slice(0, 2);
}

/** Canonical color families (e.g. "Teal", "White") distilled from the photo's color text. */
function extractColorFamilies(colorText) {
  const { colors, primaryExactColor } = inferColors(colorText);
  if (primaryExactColor === 'multicolor') return [];
  return colors.slice(0, 2);
}

/**
 * The blended cosine+facet score alone isn't strict enough about color: color is
 * only ~34% of the facet score, so a wrong-colored item with strong occasion/
 * keyword/style overlap (e.g. another "embroidered formal kurta") can still score
 * close to genuinely correct-colored items. For a TYPED query that's reasonable —
 * loose text is inherently fuzzy about color intent. For a PHOTO, we saw the exact
 * garment and know its color with much higher confidence, so apply a hard filter:
 * keep only items whose color family overlaps the photo's, and only fall back to
 * the unfiltered ranking if that would leave suspiciously few results (never
 * silently show zero when the ranked list had usable candidates).
 */
function filterByColorFamily(results, colorFamilies, minKeep = 3) {
  if (!colorFamilies.length) return results;
  const want = new Set(colorFamilies);
  const filtered = results.filter((p) => {
    const prim = p.primaryColor;
    const list = Array.isArray(p.colors) ? p.colors : [];
    return want.has(prim) || list.some((c) => want.has(c));
  });
  return filtered.length >= minKeep ? filtered : results;
}

/**
 * Text used to derive SIGNALS (color/occasion/garment) via analyzeSearchQuery.
 * Deliberately excludes `keywords` — those often mention embroidery/embellishment
 * accent colors ("floral embroidery in red and gold"), and analyzeSearchQuery
 * scans its ENTIRE input for color words with no notion of "this is decorative
 * thread, not the garment". Keeping keywords out of this text is what stops
 * red/gold from re-entering the color-match score after already being excluded
 * from the color field itself.
 */
function buildSignalText(analysis) {
  const colors = extractColorsForSearch(analysis.color);
  return [analysis.style, ...colors, analysis.category, analysis.occasion].filter(Boolean).join(' ');
}

/**
 * Text used ONLY for the embedding vector — richer than the signal text since
 * keywords (silhouette, neckline, embroidery style) genuinely help semantic
 * similarity and don't need to be color-clean the way structured facet scoring does.
 */
function buildEmbeddingText(signals, analysis) {
  const base = buildSemanticQueryText(signals);
  const keywords = (analysis.keywords || []).join(', ');
  return keywords ? `${base}\nDetails: ${keywords}` : base;
}

/**
 * Builds a recommendationEngine-shaped "intent" from the photo analysis so a
 * clothing photo can be run through the SAME honest progressive-relaxation
 * engine used by text search (agenticRelax in recommendationEngine.js) instead
 * of a plain similarity threshold. This is what makes a photo of a rare style
 * (e.g. saree — only a couple in stock) come back with an honest "no exact
 * match, here's what we relaxed" instead of silently substituting or returning
 * nothing.
 *
 * constraintPriority lists MOST important first (dressStyle — the exact
 * garment type the camera saw, the whole point of a photo search) down to
 * LEAST important (occasion — the vision model's softest, most inferred guess).
 */
function buildIntentFromPhotoAnalysis(analysis, signals) {
  const colorsExact = extractColorsForSearch(analysis.color);
  const colorsFamily = extractColorFamilies(analysis.color);
  const dressStyle = signals.garmentHints[0] || null;
  return {
    dressStyle,
    occasion: signals.occasions,
    colorExact: colorsExact[0] || null,
    colorFamily: colorsFamily[0] || 'Any',
    gender: signals.genderHint || 'women',
    maxBudget: 0,
    print: null,
    stitching: null,
    pieces: null,
    fabric: null,
    season: null,
    neckline: null,
    constraintPriority: dressStyle ? ['dressStyle', 'color', 'occasion'] : ['color', 'occasion'],
    originalMessage: `photo of a ${analysis.category || 'clothing item'}`
  };
}

export async function searchByImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const prompt = `
      Analyze this fashion item as a Pakistani fashion e-commerce stylist would.
      Identify its:
      - Category (dress, kurta, lehenga, saree, shoe, earrings, necklace, etc.)
        Pay close attention to distinguishing SAREE from LEHENGA — they are
        frequently confused, especially in modern/pre-draped saree styles where
        front pleats can look like a flared lehenga skirt panel. Use this ONE
        decisive tell FIRST, before anything else:
          • Look for a PALLU — a length of the SAME fabric crossing diagonally
            across the torso from one hip/waist up to the opposite shoulder, then
            hanging loose down the back or arm on that shoulder. This diagonal
            cross-body drape is UNIQUE to sarees — a lehenga's dupatta is draped
            separately (over both shoulders, across both arms, or around the neck
            like a shawl) and is a visually distinct piece of fabric, not a
            continuation of the skirt fabric itself.
          • If you see that diagonal pallu drape (even with vertical pleats
            visible at the front where the fabric is tucked), it is a SAREE —
            the vertical pleats are the saree's own front pleat-tuck, not a
            separate lehenga skirt panel. Do not call it a lehenga just because
            the pleats look full or flared.
          • Only call it a LEHENGA if there is NO diagonal pallu and instead a
            clearly separate, distinctly different-looking dupatta draped
            symmetrically, with an obviously separate stitched flared skirt and
            a short cropped choli blouse.
        Do not default to "lehenga" just because the outfit looks bridal or heavily
        embellished — sarees are also worn for weddings and formal occasions, and
        this diagonal-pallu check is far more reliable than "does it look bridal".
      - Color — the garment's real fabric color(s), NOT decorative embroidery
        thread colors. Most garments are ONE color: say just that (e.g. "maroon",
        "royal blue", "mustard"). If the garment genuinely has two significant
        color BLOCKS or PANELS (e.g. a white top with a teal border/panel), name
        both, e.g. "white and teal". Do NOT list embroidery/embellishment thread
        colors here — put those in keywords instead (e.g. "maroon" not "maroon
        with gold embroidery thread").
        Look carefully before calling anything "white" or "off-white" — pale/pastel
        shades (mint, sage, seafoam, pale lilac, baby pink, pastel yellow) can look
        washed-out or desaturated in photos, especially under bright light, but
        still have a real, visible color tint. Only say "white"/"off-white"/"ivory"/
        "cream" when the fabric is genuinely neutral with no color tint at all —
        if you can see ANY hint of green, pink, blue, or yellow, name that color
        (e.g. "mint" or "pale green", not "off white").
      - Style (embroidered, printed, plain, western, traditional, formal, casual, etc.)
      - Occasion it best suits (wedding, party, casual, office, eid, mehndi, formal)
      - 3-5 keywords describing notable features (neckline, embellishment colors, silhouette, fabric look)

      Return ONLY a JSON object with these EXACT types — category, color, style, and occasion
      MUST each be a single short plain-text string (never a nested object, never an array).
      "color" MUST be at most 2 real fabric colors (not embroidery threads), a few words max:
      { "category": "string", "color": "string (1 color, or 2 if genuinely bi-color)", "style": "string", "occasion": "string", "keywords": ["string", "string"] }
    `;

    let analysis, visionProvider;
    try {
      const { data, provider } = await analyzeImageWithProviderFallback({
        prompt,
        imageBase64: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype
      });
      analysis = normalizeAnalysis(data);
      visionProvider = provider;
    } catch (e) {
      return res.status(503).json({
        error: 'Image analysis is temporarily unavailable',
        hint: 'All vision AI providers (Mistral, Gemini) failed — check API keys/quota in .env',
        details: e.message
      });
    }

    const signalText = buildSignalText(analysis);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 20));
    // The photo shows exactly one item — restrict matches to its own catalog so a
    // clothing photo can't surface shoes/jewelry/watches (or vice versa) just
    // because they happen to score competitively on color/occasion embedding.
    const detectedCatalog = classifyCatalog(analysis);

    let matches, engine, relaxedFloor = false, relaxationMessage = null, intentUsed = null;
    const signals = analyzeSearchQuery(signalText);

    if (detectedCatalog === 'clothing') {
      // Clothing photos go through the SAME honest progressive-relaxation engine
      // as text search, instead of a plain similarity threshold — so a photo of
      // a rare style (e.g. saree, only a couple in stock) gets an honest "no
      // exact match, here's what we had to relax" rather than silently
      // substituting a different dressStyle or returning nothing. The intent is
      // echoed back in the response so the frontend can send it to /refine
      // after the user gives feedback, without re-uploading the photo.
      const intent = buildIntentFromPhotoAnalysis(analysis, signals);
      intentUsed = intent;
      const { products, relaxationMessage: relaxMsg } = await agenticRelax(intent);
      relaxationMessage = relaxMsg;

      let ranked = products;
      if (process.env.HUGGING_FACE_API_KEY && (signalText || analysis.keywords?.length)) {
        const queryForEmbedding = buildEmbeddingText(signals, analysis);
        const queryEmbedding = await getEmbedding(queryForEmbedding);
        ranked = products
          .map((p) => ({ ...p, _cosine: cosineSimilarity(queryEmbedding, p.embedding) }))
          .sort((a, b) => b._cosine - a._cosine);
      }
      matches = ranked.slice(0, limit).map(({ embedding, _cosine, ...p }) => ({
        ...p,
        catalog: 'clothing',
        relevanceScore: _cosine != null ? parseFloat(_cosine.toFixed(4)) : undefined
      }));
      engine = process.env.HUGGING_FACE_API_KEY
        ? `HuggingFace all-MiniLM-L6-v2 + agentic relaxation (photo analyzed by ${visionProvider})`
        : `agentic relaxation (photo analyzed by ${visionProvider})`;
    } else if (process.env.HUGGING_FACE_API_KEY && (signalText || analysis.keywords?.length)) {
      // Shoes/jewelry/watches — same hybrid cosine + facet ranking used by text
      // search, scoped to the single catalog the photo actually belongs to.
      const queryForEmbedding = buildEmbeddingText(signals, analysis);
      const queryEmbedding = await getEmbedding(queryForEmbedding);
      // Fetch a larger pool than requested so the hard color filter below has
      // enough correctly-colored candidates to fill the final result set from.
      const searchRes = await searchAcrossCatalogs(signals, queryEmbedding, { limit: Math.min(60, limit * 3), catalog: detectedCatalog });
      const colorFamilies = extractColorFamilies(analysis.color);
      matches = filterByColorFamily(searchRes.results, colorFamilies).slice(0, limit);
      relaxedFloor = searchRes.relaxedFloor;
      engine = `HuggingFace all-MiniLM-L6-v2 (photo analyzed by ${visionProvider})`;
    } else {
      // No embeddings configured — regex fallback that correctly checks BOTH the
      // canonical color family AND the exact scraped shade (a specific color word
      // like "maroon" only ever lives in primaryExactColor/exactColors).
      const searchRes = await regexSearchAcrossCatalogs(
        { color: extractColorsForSearch(analysis.color), keywords: [analysis.category, ...(analysis.keywords || [])] },
        { limit, catalog: detectedCatalog }
      );
      matches = searchRes.results;
      engine = 'keyword fallback (add HUGGING_FACE_API_KEY for semantic visual search)';
    }

    res.json({
      analysis,
      detectedCatalog,
      intent: intentUsed,
      matches,
      engine,
      relaxedFloor,
      relaxationMessage,
      message: relaxationMessage
        ? relaxationMessage
        : matches.length
          ? `Found ${matches.length} item${matches.length === 1 ? '' : 's'} matching your photo!`
          : "No close matches found in our catalog for this photo — try a different image or search by text instead."
    });
  } catch (err) {
    console.error('Image search error:', err);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
}

/**
 * Human-in-the-loop refinement: after seeing results (possibly with an honest
 * "relaxed X" disclosure), the user reacts in plain English — e.g. "prioritize
 * saree, color can change" — and this re-runs the SAME agentic relaxation
 * engine with that feedback applied. No re-upload needed: the client just
 * sends back the `intent` echoed in the original /image response.
 *
 * Two things carry the feedback into the engine, because agenticRelax's LLM
 * step (planNextRelaxation) decides what to drop by reading `originalMessage`
 * text, NOT by consulting constraintPriority — that field is only consulted in
 * the rare deterministic fallback (LLM providers unavailable). So:
 *   1. originalMessage is rewritten to state the feedback explicitly, which is
 *      what the LLM planner actually reads ("keep what they clearly care
 *      about" is literally in its instructions).
 *   2. constraintPriority is also reordered, as a second line of defense for
 *      the deterministic fallback path.
 */
export async function refineVisualSearch(req, res) {
  try {
    const { intent, feedback } = req.body || {};
    if (!intent || typeof intent !== 'object' || !intent.dressStyle && !intent.occasion?.length && !intent.colorExact) {
      return res.status(400).json({ error: 'A valid intent from the original photo search response is required.' });
    }
    if (!feedback || !String(feedback).trim()) {
      return res.status(400).json({ error: 'feedback is required, e.g. "prioritize saree, color can change".' });
    }

    const constraintPriority = parseRefinementFeedback(feedback, intent.constraintPriority || []);
    const nextIntent = {
      ...intent,
      constraintPriority,
      originalMessage: `${intent.originalMessage || 'a fashion search'}. The shopper now says: "${String(feedback).trim()}" — honor this exactly: keep whatever they said to prioritize/keep, and treat whatever they said can change/is flexible as the first thing to relax.`
    };

    const { products, relaxationMessage } = await agenticRelax(nextIntent);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const matches = products.slice(0, limit).map(({ embedding, ...p }) => ({ ...p, catalog: 'clothing' }));

    res.json({
      intent: nextIntent,
      matches,
      relaxationMessage,
      message: relaxationMessage
        ? relaxationMessage
        : matches.length
          ? `Found ${matches.length} item${matches.length === 1 ? '' : 's'} matching your feedback!`
          : "No matches found even after adjusting for your feedback — try a different image or search by text instead."
    });
  } catch (err) {
    console.error('Visual search refine error:', err);
    res.status(500).json({ error: 'Failed to refine search' });
  }
}
