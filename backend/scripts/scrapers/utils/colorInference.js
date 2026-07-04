/**
 * colorInference.js
 * Infers colors from a product's text, source-prioritized for accuracy.
 *
 * The vocabulary (shade → family) is shared with the runtime search layer via
 * constants/colorVocabulary.js, so a shade always resolves to the SAME family
 * everywhere. This fixes two classes of bug:
 *   1. Family drift  — e.g. beige items used to be stored as "Gold" and never
 *      matched a "Beige" search. Now every shade maps to one canonical family.
 *   2. Wrong shade   — e.g. a "burgundy" item getting labelled "maroon" because
 *      the old code returned the first keyword in the list rather than the shade
 *      actually present. Now the exact shade is the one that really appears,
 *      preferring the most reliable source (variant color option / title) and
 *      the earliest occurrence.
 *
 * Returns:
 *   primaryColor      — canonical family, e.g. "Red"
 *   colors            — canonical families, e.g. ["Red", "Gold"]
 *   primaryExactColor — exact shade actually found, e.g. "burgundy"
 *   exactColors       — all exact shades found, e.g. ["burgundy", "golden"]
 */

import { SHADE_ENTRIES } from '../../../constants/colorVocabulary.js';

const FALLBACK = Object.freeze({
  primaryColor: 'Multicolor',
  colors: ['Multicolor'],
  primaryExactColor: 'multicolor',
  exactColors: ['multicolor']
});

/**
 * Normalize the caller input into priority-ranked text segments.
 * Lower priority number = more trustworthy color source.
 *
 * Accepts either a plain string (legacy callers) or a structured object:
 *   { options, title, tags, description }
 *   - options: variant color option values (Shopify option2/option3) — most reliable
 *   - title:   product name — reliable
 *   - tags:    catalog tags — moderate
 *   - description: marketing copy — noisiest, used only as a last resort
 */
function buildSegments(input) {
  if (typeof input === 'string') {
    return [{ text: input.toLowerCase(), priority: 0 }];
  }
  if (!input || typeof input !== 'object') return [];

  const seg = [];
  const push = (val, priority) => {
    const text = Array.isArray(val) ? val.join(' ') : (val || '');
    if (text && String(text).trim()) seg.push({ text: String(text).toLowerCase(), priority });
  };
  // Priority (lower = more trusted). The Shopify variant COLOR OPTION is the most
  // reliable colour source and must beat a poetic print-name in the title
  // (e.g. a "Coral Reef" print whose variant option is "Green" is Green).
  push(input.options, 0);
  push(input.title, 1);
  push(input.tags, 2);
  push(input.description, 3);
  return seg;
}

export function inferColors(input) {
  const segments = buildSegments(input);
  if (!segments.length) return { ...FALLBACK, colors: [...FALLBACK.colors], exactColors: [...FALLBACK.exactColors] };

  // For each shade, record its best (most trustworthy, earliest) occurrence.
  const matches = []; // { shade, family, priority, index }
  for (const { shade, family, regex } of SHADE_ENTRIES) {
    for (const seg of segments) {
      const m = regex.exec(seg.text);
      if (m) {
        matches.push({ shade, family, priority: seg.priority, index: m.index });
        break; // first (highest-priority) segment wins for this shade
      }
    }
  }

  if (!matches.length) {
    return { ...FALLBACK, colors: [...FALLBACK.colors], exactColors: [...FALLBACK.exactColors] };
  }

  // Deprioritize "Multicolor": a generic "Multi" variant option should never
  // hide a concrete shade named elsewhere (e.g. a printed "Cosmos Blue" suit is
  // Blue, not Multicolor). Only fall back to Multicolor when NO specific shade
  // was found anywhere.
  const specific = matches.filter((m) => m.family !== 'Multicolor');
  const use = specific.length ? specific : matches;

  // Order: most trustworthy source first, then earliest in text, then more
  // specific (longer) shade first so "brick red" beats a bare "red".
  use.sort(
    (a, b) => a.priority - b.priority || a.index - b.index || b.shade.length - a.shade.length
  );

  // One representative shade per family, keeping the ranked order.
  const seenFamily = new Set();
  const ordered = [];
  for (const m of use) {
    if (!seenFamily.has(m.family)) {
      seenFamily.add(m.family);
      ordered.push(m);
    }
  }

  return {
    primaryColor: ordered[0].family,
    colors: ordered.map((o) => o.family),
    primaryExactColor: ordered[0].shade,
    exactColors: ordered.map((o) => o.shade)
  };
}

/** Returns canonical primaryColor (convenience wrapper around inferColors). */
export function inferColor(input) {
  return inferColors(input).primaryColor;
}
