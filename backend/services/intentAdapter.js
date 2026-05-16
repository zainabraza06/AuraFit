/**
 * Maps raw LLM JSON + user message into the intent object expected by recommendationEngine.
 */
import { normalizeColor } from './colorNormalize.js';
import { CANONICAL_COLORS } from '../constants/catalogConstants.js';

const RELAX_KEYS = new Set(['occasion', 'print', 'dressStyle', 'stitching', 'pieces', 'fabric', 'color', 'season']);

export const SEARCH_CATALOG_VALUES = ['clothing', 'shoes', 'jewelry', 'watches'];

/**
 * @param {string} message
 * @param {Record<string, unknown>} raw — LLM JSON
 * @returns {'clothing'|'shoes'|'jewelry'|'watches'}
 */
export function inferSearchCatalog(message, raw) {
  const allowed = new Set(SEARCH_CATALOG_VALUES);
  let fromRaw = String(raw.searchCatalog || raw.catalogFocus || '').toLowerCase().trim();
  if (fromRaw === 'jewellery') fromRaw = 'jewelry';
  if (fromRaw === 'watch') fromRaw = 'watches';
  if (fromRaw === 'shoe') fromRaw = 'shoes';
  if (allowed.has(fromRaw)) return /** @type {'clothing'|'shoes'|'jewelry'|'watches'} */ (fromRaw);

  const m = String(message || '').toLowerCase();
  const garment =
    /\b(suit|dress|kurta|lehenga|saree|sari|outfit|gown|frock|maxi|shalwar|kameez|dupatta|unstitched|3-piece|2-piece|2 piece|3 piece|co-ord|coord|abaya|ladies suit|mens wear|bridal wear)\b/;
  const shoeCue =
    /\b(shoe|shoes|footwear|sneaker|sneakers|khussa|khussas|sandal|sandals|chappal|heel|heels|pump|pumps|boot|boots|loafer|loafers|mule|mules|kolhapuri|peshawari|trainer|trainers|jogger|joggers)\b/;
  const jewelCue =
    /\b(jewelry|jewellery|jewelery|earring|earrings|necklace|bracelet|jhumka|bangle|bangles|ring|rings|nath|tikka|maang-tikka|choker|pendant|mala|bridal set|jewelry set|payal|anklet)\b/;
  const watchCue = /\b(watch|watches|smartwatch|smart watch|timepiece)\b/;

  if (!garment.test(m)) {
    const s = shoeCue.test(m);
    const j = jewelCue.test(m);
    const w = watchCue.test(m);
    const n = [s, j, w].filter(Boolean).length;
    if (n === 1) {
      if (s) return 'shoes';
      if (j) return 'jewelry';
      if (w) return 'watches';
    }
  }
  return 'clothing';
}

/** @param {string[]} arr */
function sanitizePriority(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    const k = String(x || '').toLowerCase().trim();
    if (RELAX_KEYS.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * When the intent LLM omits constraintPriority, infer drop-order helpers from fields present.
 * Most important first (same convention as LLM-filled constraintPriority).
 */
export function inferConstraintPriorityFallback(partial) {
  const occ = (partial.occasion || []).map((o) => String(o).toLowerCase());
  const formal = occ.some((o) =>
    ['wedding', 'bridal', 'mehndi', 'eid', 'party', 'formal'].includes(o)
  );
  const hasColor =
    (partial.colorFamily && partial.colorFamily !== 'Any') || partial.colorExact;
  const slots = [];
  if (partial.occasion?.length) slots.push('occasion');
  if (hasColor) slots.push('color');
  if (partial.dressStyle) slots.push('dressStyle');
  if (partial.pieces) slots.push('pieces');
  if (partial.stitching) slots.push('stitching');
  if (partial.fabric) slots.push('fabric');
  if (partial.print) slots.push('print');
  if (partial.season) slots.push('season');

  const template = formal
    ? ['occasion', 'dressStyle', 'color', 'pieces', 'fabric', 'print', 'season', 'stitching']
    : ['color', 'occasion', 'dressStyle', 'pieces', 'fabric', 'print', 'season', 'stitching'];

  const ordered = template.filter((k) => slots.includes(k));
  return sanitizePriority(ordered.length ? ordered : ['occasion', 'color', 'dressStyle']);
}

/**
 * Extracts an ordered constraint list from a plain-English priority hint
 * sent by the client (e.g. from a UI priority control: "occasion over color").
 * Returns keys in importance order (most important first), filtered to RELAX_KEYS.
 */
function buildPriorityFromHint(hint) {
  if (!hint || !String(hint).trim()) return [];
  const h = String(hint).toLowerCase();
  const out = [];
  if (/(occasion|event|function|wedding|party)/i.test(h)) out.push('occasion');
  if (/(color|colour|shade|tone)/i.test(h))               out.push('color');
  if (/(dress|style|silhouette|type|kurta|lehenga|saree)/i.test(h)) out.push('dressStyle');
  if (/(print|embroid|pattern|work)/i.test(h))            out.push('print');
  if (/(season|summer|winter)/i.test(h))                  out.push('season');
  if (/(fabric|material|lawn|silk|cotton)/i.test(h))      out.push('fabric');
  if (/(piece|2-piece|3-piece|unstitched)/i.test(h))      out.push('pieces');
  if (/(stitched|stitching)/i.test(h))                    out.push('stitching');
  return out.filter((k) => RELAX_KEYS.has(k));
}

/**
 * @param {Record<string, unknown>} raw — LLM JSON
 * @param {string} message — original user message
 * @param {string} [prioritiesHint]
 */
export function rawIntentToEngineIntent(raw, message, prioritiesHint) {
  const rawColor = String(raw.color || 'Any').trim();
  const isCanon = CANONICAL_COLORS.includes(rawColor);
  const resolvedShade =
    raw.shade && raw.shade !== 'any' && raw.shade !== 'null'
      ? String(raw.shade).toLowerCase().trim()
      : null;

  let resolvedColor = isCanon
    ? rawColor
    : CANONICAL_COLORS.find((c) => rawColor.toLowerCase().includes(c.toLowerCase())) || 'Any';

  if (resolvedShade) {
    const aliasResolved = normalizeColor(resolvedShade);
    if (aliasResolved && CANONICAL_COLORS.includes(aliasResolved)) {
      resolvedColor = aliasResolved;
    }
  }

  // ── Resolve remaining fields needed for the fallback ────────────────────────
  const occasion = Array.isArray(raw.occasion) ? raw.occasion : ['casual'];
  const seasonRaw = raw.season && raw.season !== 'null' ? String(raw.season).toLowerCase().trim() : null;
  const season =
    seasonRaw && ['summer', 'winter', 'all-season'].includes(seasonRaw) ? seasonRaw : null;

  const dressStyleRaw = raw.dressStyle && raw.dressStyle !== 'null' ? String(raw.dressStyle).toLowerCase().trim() : null;

  const printRaw = raw.print && raw.print !== 'null' ? String(raw.print).toLowerCase().trim() : null;
  const print =
    printRaw && ['embroidered', 'printed', 'plain', 'mixed'].includes(printRaw) ? printRaw : null;

  const pieces = typeof raw.pieces === 'number' && raw.pieces >= 1 && raw.pieces <= 4 ? raw.pieces : null;

  const stitchingRaw =
    raw.stitching && raw.stitching !== 'null' ? String(raw.stitching).toLowerCase().trim() : null;
  const fabricRaw =
    raw.fabric && raw.fabric !== 'null' ? String(raw.fabric).toLowerCase().trim() : null;

  // ── Constraint priority — 3-tier cascade ─────────────────────────────────
  //
  //   Tier 1: Client sends prioritiesHint (explicit UI control, e.g. a priority
  //           picker or the user typed "occasion over color").
  //           → Those keys go FIRST (most protected), then LLM order fills the rest.
  //
  //   Tier 2: LLM detected explicit or inferred priority from the user's message
  //           (e.g. "must be red, don't care about occasion" → ["color", ...]).
  //           → Use directly when no Tier 1 hint is present.
  //
  //   Tier 3: Code-based inference from field presence + occasion type.
  //           → Used when Tier 1 & 2 both produce an empty list.
  //
  //   Tier 4: DEFAULT_RELAX_ORDER in buildUnifiedRelaxOrder (last resort).
  //
  let constraintPriority;

  const hintKeys = buildPriorityFromHint(prioritiesHint);
  const llmOrder  = sanitizePriority(raw.constraintPriority);

  if (hintKeys.length) {
    // Tier 1: hint-specified keys go first; LLM's remaining keys fill the rest
    constraintPriority = [...new Set([...hintKeys, ...llmOrder])];
  } else if (llmOrder.length) {
    // Tier 2: LLM fully decides the order
    constraintPriority = llmOrder;
  } else {
    // Tier 3: code-based fallback
    constraintPriority = inferConstraintPriorityFallback({
      occasion,
      season,
      dressStyle:  dressStyleRaw,
      pieces,
      stitching:   stitchingRaw,
      fabric:      fabricRaw,
      print,
      colorFamily: resolvedColor !== 'Any' ? resolvedColor : null,
      colorExact:  resolvedShade
    });
  }

  const searchCatalog = inferSearchCatalog(message, raw);

  const intent = {
    searchCatalog,
    color: resolvedColor,
    shade: resolvedShade,
    colorFamily: resolvedColor !== 'Any' ? resolvedColor : 'Any',
    colorExact: resolvedShade,
    occasion,
    style: Array.isArray(raw.style) ? raw.style : [],
    piece: raw.piece && raw.piece !== 'null' ? String(raw.piece).toLowerCase().trim() : null,
    pieces,
    fabric:    fabricRaw   || null,
    stitching: stitchingRaw || null,
    print,
    gender: ['women', 'men', 'kids', 'unisex'].includes(raw.gender) ? raw.gender : 'women',
    dressType: raw.dressType && raw.dressType !== 'null' ? String(raw.dressType).toLowerCase().trim() : null,
    dressStyle: dressStyleRaw || null,
    maxBudget: typeof raw.maxBudget === 'number' ? raw.maxBudget : 0,
    season,
    constraintPriority,
    intentSummary: raw.intentSummary || message,
    originalMessage: message,
    aiAnalysis: raw.aiAnalysis || ''
  };

  if (!intent.dressStyle && intent.piece) {
    const p = intent.piece.toLowerCase();
    if (p.includes('lehenga')) intent.dressStyle = 'lehenga';
    else if (p.includes('saree') || p.includes('sari')) intent.dressStyle = 'saree';
    else if (p.includes('maxi') || p.includes('gown')) intent.dressStyle = 'maxi';
    else if (p.includes('kurta') || p.includes('kameez')) intent.dressStyle = 'kurta';
    else if (p.includes('shalwar')) intent.dressStyle = 'shalwar-kameez';
  }

  return intent;
}
