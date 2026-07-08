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
 * gold embroidery accents") rather than as a single base shade — great for
 * display, but it corrupts search: both the facet color-match AND the sentence
 * embedding pick up "red"/"green" as strong signals and pull in wrongly-colored
 * products almost as high as the actually-matching white ones. Distill the
 * analysis color down to just the FIRST recognized base shade for search
 * purposes; the full descriptive text is still shown to the user untouched.
 */
function extractPrimaryColor(colorText) {
  const { primaryExactColor } = inferColors(colorText);
  return primaryExactColor !== 'multicolor' ? primaryExactColor : (colorText || '').split(/\s+/).slice(0, 2).join(' ');
}

/**
 * Builds a natural-language description from the photo analysis, in the same
 * shape a user might type — so it benefits from the same occasion / color /
 * garment-hint extraction as a typed semantic search query. Uses the distilled
 * primary color (not the full descriptive color text) to avoid embellishment
 * colors hijacking the color-match score.
 */
function describeAnalysis(analysis) {
  const primaryColor = extractPrimaryColor(analysis.color);
  const parts = [analysis.style, primaryColor, analysis.category, ...analysis.keywords].filter(Boolean);
  return parts.join(' ');
}

export async function searchByImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const prompt = `
      Analyze this fashion item as a Pakistani fashion e-commerce stylist would.
      Identify its:
      - Category (dress, kurta, lehenga, saree, shoe, earrings, necklace, etc.)
      - Primary color — the MAIN BASE fabric color ONLY, as ONE or TWO words
        (e.g. "maroon", "off white", "bottle green"). Do NOT describe embroidery,
        embellishment, print, or accent colors here — mention those in keywords
        instead (e.g. "off white" not "off white with red and gold embroidery").
      - Style (embroidered, printed, plain, western, traditional, formal, casual, etc.)
      - Occasion it best suits (wedding, party, casual, office, eid, mehndi, formal)
      - 3-5 keywords describing notable features (neckline, embellishment colors, silhouette, fabric look)

      Return ONLY a JSON object with these EXACT types — category, color, style, and occasion
      MUST each be a single short plain-text string (never a nested object, never an array).
      "color" MUST be only the base color, 1-2 words maximum:
      { "category": "string", "color": "string (1-2 words, base color only)", "style": "string", "occasion": "string", "keywords": ["string", "string"] }
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

    const descriptionText = describeAnalysis(analysis);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 20));

    let matches, engine, relaxedFloor = false;

    if (process.env.HUGGING_FACE_API_KEY && descriptionText) {
      // Same hybrid cosine + facet ranking used by text search, across ALL catalogs
      // (clothing/shoes/jewelry/watches) — so a photo of shoes correctly surfaces shoes.
      const signals = analyzeSearchQuery(descriptionText);
      const queryForEmbedding = buildSemanticQueryText(signals);
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
        { color: extractPrimaryColor(analysis.color), keywords: [analysis.category, ...(analysis.keywords || [])] },
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
