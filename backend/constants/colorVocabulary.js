/**
 * colorVocabulary.js — single source of truth for color families + shades.
 *
 * Both the scraper (scripts/scrapers/utils/colorInference.js) and the runtime
 * search layer (services/colorNormalize.js) import from here so a shade always
 * resolves to the SAME canonical family in every part of the app.
 *
 * Exports:
 *   CANONICAL_COLORS   — the closed set of family names used for filters/intent.
 *   COLOR_ALIASES      — shade phrase → canonical family (lower-case keys).
 *   SHADE_ENTRIES      — [{ shade, family, regex }] for text inference,
 *                        sorted longest-phrase-first for greedy matching.
 *   familyOfShade()    — resolve a single shade word to its family (or null).
 */

// ─── Canonical families ─────────────────────────────────────────────────────
// NOTE: Beige is a first-class family here. Previously the scraper folded beige
// shades into "Gold", so beige items never matched a "Beige" search.
export const CANONICAL_COLORS = [
  'Black', 'White', 'Grey', 'Red', 'Pink', 'Purple',
  'Blue', 'Green', 'Teal', 'Yellow', 'Orange',
  'Gold', 'Beige', 'Brown', 'Multicolor'
];

// ─── Shade → family aliases ─────────────────────────────────────────────────
export const COLOR_ALIASES = {
  // Blue
  navy: 'Blue', 'navy blue': 'Blue', 'sky blue': 'Blue', cobalt: 'Blue',
  'royal blue': 'Blue', 'light blue': 'Blue', 'powder blue': 'Blue',
  'steel blue': 'Blue', 'pastel blue': 'Blue', 'dark blue': 'Blue',
  'deep blue': 'Blue', 'midnight blue': 'Blue', 'electric blue': 'Blue',
  'baby blue': 'Blue', 'prussian blue': 'Blue', cerulean: 'Blue',
  azure: 'Blue', denim: 'Blue', indigo: 'Blue', nila: 'Blue',
  // Green
  emerald: 'Green', olive: 'Green', mint: 'Green', sage: 'Green',
  'forest green': 'Green', 'bottle green': 'Green', 'sea green': 'Green',
  'dark green': 'Green', 'deep green': 'Green', 'mehendi green': 'Green',
  'mint green': 'Green', 'lime green': 'Green', lime: 'Green', pista: 'Green',
  pistachio: 'Green', 'apple green': 'Green', 'jungle green': 'Green',
  'hunter green': 'Green', 'kelly green': 'Green', 'army green': 'Green',
  'military green': 'Green', forest: 'Green', 'neon green': 'Green',
  'grass green': 'Green', 'parrot green': 'Green', dhani: 'Green',
  mehendi: 'Green', sabz: 'Green',
  // Red
  maroon: 'Red', crimson: 'Red', burgundy: 'Red', wine: 'Red', rust: 'Red',
  'dark red': 'Red', 'deep red': 'Red', 'brick red': 'Red', 'dark maroon': 'Red',
  'deep maroon': 'Red', 'dark burgundy': 'Red', cherry: 'Red', cardinal: 'Red',
  scarlet: 'Red', ruby: 'Red', raspberry: 'Red', strawberry: 'Red',
  'blood red': 'Red', mehroon: 'Red', mehrun: 'Red', merun: 'Red',
  surkh: 'Red', laal: 'Red',
  // Beige
  beige: 'Beige', nude: 'Beige', camel: 'Beige', fawn: 'Beige',
  khaki: 'Beige', khaaki: 'Beige', sand: 'Beige', oat: 'Beige',
  biscuit: 'Beige', wheat: 'Beige', taupe: 'Beige', 'nude beige': 'Beige',
  'warm beige': 'Beige', ecru: 'Beige', 'skin': 'Beige',
  // White
  ivory: 'White', cream: 'White', 'off white': 'White', 'off-white': 'White',
  snow: 'White', pearl: 'White', chalk: 'White', 'milk white': 'White',
  'pure white': 'White', 'bright white': 'White', 'warm white': 'White',
  eggshell: 'White', 'antique white': 'White', safed: 'White',
  // Grey
  silver: 'Grey', ash: 'Grey', 'steel grey': 'Grey', slate: 'Grey',
  smoke: 'Grey', gray: 'Grey', grey: 'Grey', 'light grey': 'Grey',
  'dark grey': 'Grey', 'steel gray': 'Grey', platinum: 'Grey',
  gunmetal: 'Grey', 'charcoal grey': 'Grey', 'warm grey': 'Grey',
  'cool grey': 'Grey', 'dove grey': 'Grey',
  // Black
  charcoal: 'Black', graphite: 'Black', onyx: 'Black', ebony: 'Black',
  'jet black': 'Black', 'pitch black': 'Black', 'off black': 'Black', black: 'Black',
  // Pink
  blush: 'Pink', peach: 'Pink', rose: 'Pink', fuchsia: 'Pink',
  'hot pink': 'Pink', 'dusty pink': 'Pink', 'baby pink': 'Pink',
  'nude pink': 'Pink', 'pastel pink': 'Pink', 'dusty rose': 'Pink',
  'old rose': 'Pink', 'candy pink': 'Pink', 'shocking pink': 'Pink',
  'light pink': 'Pink', 'deep pink': 'Pink', salmon: 'Pink', magenta: 'Pink',
  cerise: 'Pink', flamingo: 'Pink', carnation: 'Pink', 'blush pink': 'Pink',
  'rose pink': 'Pink', bubblegum: 'Pink', gulabi: 'Pink', 'rani pink': 'Pink',
  // Purple
  lavender: 'Purple', lilac: 'Purple', mauve: 'Purple', plum: 'Purple',
  violet: 'Purple', grape: 'Purple', wisteria: 'Purple', 'pastel purple': 'Purple',
  'light purple': 'Purple', 'deep purple': 'Purple', 'dark purple': 'Purple',
  'royal purple': 'Purple', 'dusty purple': 'Purple', amethyst: 'Purple',
  orchid: 'Purple', periwinkle: 'Purple', jamuni: 'Purple', baingan: 'Purple',
  // Orange
  coral: 'Orange', terracotta: 'Orange', amber: 'Orange', 'burnt orange': 'Orange',
  'peach orange': 'Orange', apricot: 'Orange', pumpkin: 'Orange',
  tangerine: 'Orange', mango: 'Orange', 'deep orange': 'Orange',
  'burnt sienna': 'Orange', copper: 'Orange', narangi: 'Orange',
  // Yellow
  mustard: 'Yellow', lemon: 'Yellow', saffron: 'Yellow', 'lemon yellow': 'Yellow',
  'pastel yellow': 'Yellow', canary: 'Yellow', sunflower: 'Yellow',
  'golden yellow': 'Yellow', 'bright yellow': 'Yellow', 'neon yellow': 'Yellow',
  chartreuse: 'Yellow', ochre: 'Yellow', zard: 'Yellow', peela: 'Yellow',
  // Gold (metallic)
  golden: 'Gold', gold: 'Gold', 'antique gold': 'Gold', 'dull gold': 'Gold',
  champagne: 'Gold', bronze: 'Gold', brass: 'Gold', 'metallic gold': 'Gold',
  'light gold': 'Gold', 'rose gold': 'Gold',
  // Teal
  turquoise: 'Teal', aqua: 'Teal', cyan: 'Teal', seafoam: 'Teal',
  'teal green': 'Teal', 'dark teal': 'Teal', 'deep teal': 'Teal',
  'teal blue': 'Teal', peacock: 'Teal', 'peacock blue': 'Teal',
  ferozi: 'Teal', firozi: 'Teal', teal: 'Teal',
  // Brown
  chocolate: 'Brown', mocha: 'Brown', coffee: 'Brown', caramel: 'Brown',
  tan: 'Brown', walnut: 'Brown', toffee: 'Brown', chestnut: 'Brown',
  'dark brown': 'Brown', 'light brown': 'Brown', mahogany: 'Brown',
  sienna: 'Brown', hazel: 'Brown', cocoa: 'Brown', 'saddle brown': 'Brown',
  brown: 'Brown',
  // Base families that are also their own shade word
  red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow', pink: 'Pink',
  purple: 'Purple', orange: 'Orange', white: 'White',
  // Multicolor (explicit only — print words are handled as patterns, not colors)
  multi: 'Multicolor', multicolor: 'Multicolor', 'multi-color': 'Multicolor',
  'multi colour': 'Multicolor', multicolour: 'Multicolor', 'multi color': 'Multicolor'
};

// ─── Pattern words that are NOT colors ──────────────────────────────────────
// These describe print/weave, not a color, and must never drive color inference.
export const NON_COLOR_WORDS = new Set([
  'printed', 'floral', 'patterned', 'geometric', 'abstract', 'tie dye',
  'ombre', 'colourful', 'colorful', 'linen', 'natural', 'stone', 'cotton',
  'silk', 'velvet', 'chiffon', 'organza', 'net'
]);

// ─── Build ordered shade entries for text inference ─────────────────────────
function buildShadeEntries() {
  const entries = Object.entries(COLOR_ALIASES)
    .filter(([shade]) => !NON_COLOR_WORDS.has(shade))
    .map(([shade, family]) => {
      // allow "off white"/"off-white" and space/hyphen variants
      const escaped = shade.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]+');
      return { shade, family, regex: new RegExp(`\\b${escaped}\\b`) };
    });
  // Longest phrase first → "navy blue" beats "blue", "brick red" beats "red".
  entries.sort((a, b) => b.shade.length - a.shade.length);
  return entries;
}

export const SHADE_ENTRIES = buildShadeEntries();

/** Resolve a single shade/word to its canonical family, or null if unknown. */
export function familyOfShade(word) {
  if (!word) return null;
  const key = String(word).toLowerCase().trim();
  return COLOR_ALIASES[key] || null;
}
