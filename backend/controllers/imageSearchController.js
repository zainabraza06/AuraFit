import { analyzeImageWithProviderFallback } from '../services/llmClient.js';
import { analyzeSearchQuery, buildSemanticQueryText } from '../services/searchQueryIntel.js';
import { getEmbedding, searchAcrossCatalogs, regexSearchAcrossCatalogs } from '../services/crossCatalogSearch.js';
import { inferColors } from '../scripts/scrapers/utils/colorInference.js';

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

export async function searchByImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const prompt = `
      Analyze this fashion item as a Pakistani fashion e-commerce stylist would.
      Identify its:
      - Category (dress, kurta, lehenga, saree, shoe, earrings, necklace, etc.)
      - Color — the garment's real fabric color(s), NOT decorative embroidery
        thread colors. Most garments are ONE color: say just that (e.g. "maroon",
        "off white"). If the garment genuinely has two significant color BLOCKS
        or PANELS (e.g. a white top with a teal border/panel), name both, e.g.
        "white and teal". Do NOT list embroidery/embellishment thread colors here
        — put those in keywords instead (e.g. "off white" not "off white with red
        and gold embroidery thread").
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

    let matches, engine, relaxedFloor = false;

    if (process.env.HUGGING_FACE_API_KEY && (signalText || analysis.keywords?.length)) {
      // Same hybrid cosine + facet ranking used by text search, across ALL catalogs
      // (clothing/shoes/jewelry/watches) — so a photo of shoes correctly surfaces shoes.
      // Signals (color/occasion/garment) come from the clean signal text only;
      // the embedding text separately layers in keywords for semantic richness.
      const signals = analyzeSearchQuery(signalText);
      const queryForEmbedding = buildEmbeddingText(signals, analysis);
      const queryEmbedding = await getEmbedding(queryForEmbedding);
      const searchRes = await searchAcrossCatalogs(signals, queryEmbedding, { limit });
      matches = searchRes.results;
      relaxedFloor = searchRes.relaxedFloor;
      engine = `HuggingFace all-MiniLM-L6-v2 (photo analyzed by ${visionProvider})`;
    } else {
      // No embeddings configured — regex fallback that correctly checks BOTH the
      // canonical color family AND the exact scraped shade (a specific color word
      // like "maroon" only ever lives in primaryExactColor/exactColors).
      const searchRes = await regexSearchAcrossCatalogs(
        { color: extractColorsForSearch(analysis.color), keywords: [analysis.category, ...(analysis.keywords || [])] },
        { limit }
      );
      matches = searchRes.results;
      engine = 'keyword fallback (add HUGGING_FACE_API_KEY for semantic visual search)';
    }

    res.json({
      analysis,
      matches,
      engine,
      relaxedFloor,
      message: matches.length
        ? `Found ${matches.length} item${matches.length === 1 ? '' : 's'} matching your photo!`
        : "No close matches found in our catalog for this photo — try a different image or search by text instead."
    });
  } catch (err) {
    console.error('Image search error:', err);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
}
