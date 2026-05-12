/**
 * LLM proposes which accessory taxonomy buckets to query in Mongo (context-aware).
 * Falls back to null → caller uses broad accessory pools.
 * Validates against ALLOWED_* with fuzzy resolution for minor LLM / catalog drift.
 */
import { completeJsonWithProviderFallback } from './llmClient.js';
import {
  ALLOWED_SHOE_TYPES,
  ALLOWED_JEWELRY_TYPES,
  ALLOWED_WATCH_TYPES,
  COMPLETION_FOCUS_VALUES
} from '../constants/accessoryTaxonomy.js';
import { bumpMetric, logRecommendationEvent } from './recommendationMetrics.js';

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return text;
  return text.substring(start, end + 1);
}

/** @param {string} a @param {string} b */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev + cost, row[j] + 1, row[j - 1] + 1);
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * Map a raw token to the closest allowed catalog string (exact, hyphen norm, plural-s, Levenshtein ≤2).
 * @param {string} token
 * @param {string[]} allowedList
 */
function resolveToAllowedList(token, allowedList) {
  const k = String(token || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');
  if (!k || k.length < 3) return null;
  const set = new Set(allowedList);
  if (set.has(k)) return k;
  if (k.length > 3 && k.endsWith('s')) {
    const sg = k.slice(0, -1);
    if (set.has(sg)) return sg;
  }
  let best = null;
  let bestD = 99;
  for (const a of allowedList) {
    const lab = String(a).toLowerCase();
    if (lab === k) return k;
    const d = levenshtein(k, lab);
    if (d < bestD && d <= 2 && k.length >= 4) {
      bestD = d;
      best = lab;
    }
  }
  return best;
}

/**
 * @param {unknown} arr
 * @param {string[]} allowedList
 * @returns {{ values: string[]; fuzzyCount: number; droppedRaw: number }}
 */
function pickAllowedFuzzy(arr, allowedList) {
  const set = new Set(allowedList);
  const raw = Array.isArray(arr) ? arr : [];
  const out = [];
  let fuzzyCount = 0;
  for (const x of raw) {
    const k = String(x || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/_/g, '-');
    if (!k) continue;
    let resolved = set.has(k) ? k : resolveToAllowedList(k, allowedList);
    if (!resolved || !set.has(resolved)) continue;
    if (out.includes(resolved)) continue;
    out.push(resolved);
    if (!set.has(k)) fuzzyCount += 1;
  }
  return { values: out, fuzzyCount, droppedRaw: Math.max(0, raw.length - out.length) };
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {object} plan — may include `planMeta` for internal logging (strip before API).
 */
export function validateAccessoryPlan(raw) {
  const shoeSet = new Set(ALLOWED_SHOE_TYPES);
  const jewSet = new Set(ALLOWED_JEWELRY_TYPES);
  const watchSet = new Set(ALLOWED_WATCH_TYPES);
  const compSet = new Set(COMPLETION_FOCUS_VALUES);

  const shoes = pickAllowedFuzzy(raw?.shoeTypes, ALLOWED_SHOE_TYPES);
  const jewels = pickAllowedFuzzy(raw?.jewelryTypes, ALLOWED_JEWELRY_TYPES);
  const watches = pickAllowedFuzzy(raw?.watchTypes, ALLOWED_WATCH_TYPES);
  const completionRaw = Array.isArray(raw?.completionFocus) ? raw.completionFocus : [];
  const completionFocus = [];
  for (const x of completionRaw) {
    const k = String(x || '').toLowerCase().trim();
    if (compSet.has(k) && !completionFocus.includes(k)) completionFocus.push(k);
  }

  const rawShoeN = Array.isArray(raw?.shoeTypes) ? raw.shoeTypes.length : 0;
  const rawJewN = Array.isArray(raw?.jewelryTypes) ? raw.jewelryTypes.length : 0;
  const rawWatchN = Array.isArray(raw?.watchTypes) ? raw.watchTypes.length : 0;

  const planMeta = {
    rawCounts: { shoes: rawShoeN, jewelry: rawJewN, watches: rawWatchN },
    keptCounts: { shoes: shoes.values.length, jewelry: jewels.values.length, watches: watches.values.length },
    fuzzyResolved: {
      shoes: shoes.fuzzyCount,
      jewelry: jewels.fuzzyCount,
      watches: watches.fuzzyCount
    },
    droppedHints: {
      shoes: shoes.droppedRaw,
      jewelry: jewels.droppedRaw,
      watches: watches.droppedRaw
    }
  };

  const strippedAccessory =
    rawShoeN > shoes.values.length ||
    rawJewN > jewels.values.length ||
    rawWatchN > watches.values.length;
  if (strippedAccessory) bumpMetric('accessory_plan_taxonomy_stripped');
  if (shoes.fuzzyCount + jewels.fuzzyCount + watches.fuzzyCount > 0) {
    bumpMetric('accessory_plan_taxonomy_fuzzy');
  }

  return {
    shoeTypes: shoes.values,
    jewelryTypes: jewels.values,
    watchTypes: watches.values,
    completionFocus,
    rationale: typeof raw?.rationale === 'string' ? raw.rationale.slice(0, 500) : '',
    planMeta
  };
}

/** Remove internal fields before sending to the client. */
export function stripAccessoryPlanForClient(plan) {
  if (!plan) return null;
  const { planMeta: _m, ...rest } = plan;
  return rest;
}

/**
 * @param {object} intent — engine intent
 * @param {object|null} heroProduct — primary dress for context (use AI-ranked #1 when available)
 */
export async function planAccessorySearchFromContext(intent, heroProduct) {
  const heroBlock = heroProduct
    ? `Primary outfit candidate for accessory matching:\n- Name: ${heroProduct.name || ''}\n- Colors: ${heroProduct.primaryColor || ''} / ${(heroProduct.colors || []).join(', ')}\n- Occasion: ${(heroProduct.occasion || []).join(', ')}\n- Dress style: ${heroProduct.dressStyle || ''}\n- Fashion type: ${heroProduct.fashionType || ''}\n- Piece: ${heroProduct.pieceType || ''} includes: ${(heroProduct.pieceDetails?.includes || []).join(', ')}\n`
    : '';

  const system = `You output ONLY valid JSON for AuraFit accessory DATABASE filters.
Allowed shoeTypes (use exact strings): ${ALLOWED_SHOE_TYPES.join(', ')}
Allowed jewelryTypes: ${ALLOWED_JEWELRY_TYPES.join(', ')}
Allowed watchTypes: ${ALLOWED_WATCH_TYPES.join(', ')}
completionFocus (0–3 items from): ${COMPLETION_FOCUS_VALUES.join(', ')}

Pick shoeTypes / jewelryTypes / watchTypes that fit the user's occasion, formality, eastern vs western, and gender. Use 4–12 shoe types max, 4–10 jewelry, 2–5 watch types. Prefer ethnic footwear for eastern bridal/mehndi/eid; heels/pumps for formal party; sneakers/flat for casual; khussa/kolhapuri for festive eastern.
completionFocus guides optional coordinate pieces: dupatta_eastern, bottom_eastern, bottom_western, minimal_jewelry, statement_jewelry, none.`;

  const user = `User request summary: ${intent.intentSummary || intent.originalMessage || ''}
Original message: ${intent.originalMessage || ''}
Parsed intent: gender=${intent.gender}, occasions=${(intent.occasion || []).join(',')}, dressStyle=${intent.dressStyle || 'n/a'}, dressType=${intent.dressType || 'n/a'}, color=${intent.colorFamily || intent.color || 'Any'}, season=${intent.season || 'n/a'}, pieces=${intent.pieces ?? 'n/a'}.
${heroBlock}
Return JSON only:
{
  "shoeTypes": ["khussa", "heel"],
  "jewelryTypes": ["jhumka", "necklace"],
  "watchTypes": ["dress", "minimalist"],
  "completionFocus": ["dupatta_eastern", "statement_jewelry"],
  "rationale": "one short sentence"
}`;

  try {
    const { text, provider } = await completeJsonWithProviderFallback({
      system,
      user,
      temperature: 0.15
    });
    const parsed = JSON.parse(extractJson(text));
    const plan = validateAccessoryPlan(parsed);
    logRecommendationEvent({
      event: 'accessory_plan_llm_ok',
      provider,
      planMeta: plan.planMeta
    });
    if (
      !plan.shoeTypes.length &&
      !plan.jewelryTypes.length &&
      !plan.watchTypes.length &&
      !plan.completionFocus.length
    ) {
      bumpMetric('accessory_plan_empty_after_validate');
      return null;
    }
    return plan;
  } catch (e) {
    bumpMetric('accessory_plan_llm_error');
    logRecommendationEvent({ event: 'accessory_plan_llm_error', error: String(e.message || e) });
    console.warn('[planAccessorySearchFromContext] failed:', e.message);
    return null;
  }
}
