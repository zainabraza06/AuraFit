/**
 * colorTheory.js
 * Fashion color compatibility rules for AI recommendation scoring.
 *
 * Implements:
 * - Complementary color pairs
 * - Neutral tone compatibility
 * - Monochromatic scoring
 * - Contrast and clash detection
 *
 * Returns a score 0-1 for how well two colors pair in fashion.
 */

// ─── Color compatibility matrix ───────────────────────────────────────────────
// Score: 1.0 = perfect match, 0.7 = good, 0.5 = neutral, 0.2 = clash

const COMPATIBILITY_MATRIX = {
  Black: {
    Black: 0.8,  // Monochrome — chic
    White: 1.0,  // Classic contrast
    Red: 0.9,    // Bold, powerful
    Gold: 1.0,   // Elegant
    Silver: 0.9,
    Grey: 0.8,
    Pink: 0.85,
    Blue: 0.75,
    Green: 0.7,
    Purple: 0.8,
    Brown: 0.7,
    Orange: 0.6,
    Yellow: 0.6,
    Teal: 0.75,
    Multicolor: 0.7,
    White: 1.0
  },
  White: {
    Black: 1.0,
    White: 0.7,
    Blue: 0.95,  // Fresh, clean
    Pink: 0.9,
    Gold: 0.85,
    Beige: 0.9,
    Brown: 0.8,
    Green: 0.85,
    Red: 0.85,
    Grey: 0.85,
    Purple: 0.8,
    Teal: 0.85,
    Orange: 0.75,
    Yellow: 0.75,
    Multicolor: 0.8
  },
  Red: {
    Black: 0.9,
    White: 0.85,
    Gold: 0.85,  // Festive
    Silver: 0.8,
    Grey: 0.7,
    Pink: 0.3,   // Clash — similar warm tones
    Orange: 0.2, // Strong clash
    Blue: 0.6,
    Green: 0.5,
    Brown: 0.65,
    Purple: 0.55,
    Teal: 0.6,
    Yellow: 0.5,
    Multicolor: 0.7
  },
  Gold: {
    Black: 1.0,
    White: 0.85,
    Red: 0.85,
    Emerald: 0.95, // Luxe combo
    Green: 0.9,
    Navy: 0.9,
    Blue: 0.8,
    Brown: 0.75,
    Grey: 0.7,
    Pink: 0.7,
    Orange: 0.5,
    Purple: 0.75,
    Teal: 0.7,
    Multicolor: 0.75,
    Silver: 0.5   // Too similar metallic
  },
  Pink: {
    Black: 0.85,
    White: 0.9,
    Gold: 0.7,
    Grey: 0.8,
    Blue: 0.7,
    Purple: 0.6,
    Green: 0.65,
    Brown: 0.7,
    Red: 0.3,
    Orange: 0.3,
    Yellow: 0.5,
    Teal: 0.65,
    Multicolor: 0.7
  },
  Blue: {
    White: 0.95,
    Black: 0.75,
    Gold: 0.8,
    Silver: 0.8,
    Grey: 0.85,
    Brown: 0.8,
    Pink: 0.7,
    Orange: 0.5,
    Red: 0.6,
    Green: 0.65,
    Purple: 0.6,
    Teal: 0.7,
    Yellow: 0.6,
    Multicolor: 0.75
  },
  Green: {
    White: 0.85,
    Black: 0.7,
    Gold: 0.9,
    Brown: 0.8,
    Beige: 0.85,
    Pink: 0.65,
    Blue: 0.65,
    Grey: 0.7,
    Red: 0.5,
    Orange: 0.5,
    Purple: 0.55,
    Yellow: 0.5,
    Teal: 0.75,
    Multicolor: 0.7
  },
  Grey: {
    Black: 0.8,
    White: 0.85,
    Pink: 0.8,
    Blue: 0.85,
    Red: 0.7,
    Gold: 0.7,
    Purple: 0.7,
    Green: 0.7,
    Brown: 0.75,
    Orange: 0.6,
    Yellow: 0.6,
    Teal: 0.7,
    Multicolor: 0.7
  },
  Purple: {
    Black: 0.8,
    White: 0.8,
    Gold: 0.75,
    Silver: 0.8,
    Grey: 0.7,
    Pink: 0.6,
    Green: 0.55,
    Blue: 0.6,
    Orange: 0.3, // Clash
    Yellow: 0.4,
    Teal: 0.65,
    Multicolor: 0.7
  },
  Teal: {
    White: 0.85,
    Black: 0.75,
    Gold: 0.7,
    Silver: 0.75,
    Grey: 0.7,
    Pink: 0.65,
    Orange: 0.4,
    Red: 0.6,
    Purple: 0.65,
    Blue: 0.7,
    Multicolor: 0.7
  },
  Brown: {
    White: 0.8,
    Black: 0.7,
    Gold: 0.75,
    Beige: 0.9,
    Green: 0.8,
    Blue: 0.8,
    Pink: 0.7,
    Orange: 0.6,
    Grey: 0.75,
    Teal: 0.7,
    Multicolor: 0.7
  },
  Beige: {
    Black: 0.8,
    White: 0.85,
    Brown: 0.9,   // Earth-tone harmony
    Gold: 0.85,
    Green: 0.8,
    Blue: 0.75,
    Pink: 0.75,
    Grey: 0.8,
    Red: 0.65,
    Orange: 0.6,
    Purple: 0.65,
    Yellow: 0.6,
    Teal: 0.7,
    Beige: 0.7,   // Tonal layering
    Multicolor: 0.7
  },
  Multicolor: {
    Black: 0.7,
    White: 0.8,
    Gold: 0.75,
    Grey: 0.7,
    Beige: 0.75
  }
};

// ─── Neutral colors always compatible ────────────────────────────────────────
const NEUTRAL_COLORS = new Set(['Black', 'White', 'Grey', 'Gold', 'Silver', 'Beige', 'Brown', 'Multicolor']);

/**
 * getColorCompatibilityScore(color1, color2)
 * Returns a score 0-1 representing fashion compatibility between two colors.
 */
export function getColorCompatibilityScore(color1, color2) {
  if (!color1 || !color2) return 0.5;

  // Normalize
  const c1 = normalize(color1);
  const c2 = normalize(color2);

  if (c1 === c2) return 0.75; // Monochrome — generally good

  // Check matrix (both directions)
  const score =
    COMPATIBILITY_MATRIX[c1]?.[c2] ??
    COMPATIBILITY_MATRIX[c2]?.[c1] ??
    defaultScore(c1, c2);

  return score;
}

/**
 * getColorArrayCompatibility(colors1[], colors2[])
 * Returns best-match score across all color pair combinations.
 */
export function getColorArrayCompatibility(colors1 = [], colors2 = []) {
  if (!colors1.length || !colors2.length) return 0.5;

  let best = 0;
  for (const c1 of colors1) {
    for (const c2 of colors2) {
      const score = getColorCompatibilityScore(c1, c2);
      if (score > best) best = score;
    }
  }
  return best;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(color) {
  if (!color) return 'Multicolor';
  const s = color.trim();
  // Keep in sync with COLOR_ALIASES in recommendationEngine.js
  const map = {
    // Blue
    'navy': 'Blue', 'navy blue': 'Blue', 'sky blue': 'Blue', 'cobalt': 'Blue',
    'royal blue': 'Blue', 'light blue': 'Blue', 'powder blue': 'Blue', 'dark blue': 'Blue',
    'steel blue': 'Blue', 'pastel blue': 'Blue', 'denim': 'Blue', 'indigo': 'Blue',
    // Green
    'emerald': 'Green', 'olive': 'Green', 'mint': 'Green', 'sage': 'Green',
    'forest green': 'Green', 'bottle green': 'Green', 'sea green': 'Green',
    'mint green': 'Green', 'dark green': 'Green', 'mehendi green': 'Green',
    'pista': 'Green', 'pistachio': 'Green', 'dhani': 'Green',
    // Red / Maroon
    'maroon': 'Red', 'crimson': 'Red', 'burgundy': 'Red', 'wine': 'Red', 'rust': 'Red',
    'dark red': 'Red', 'deep red': 'Red', 'brick red': 'Red', 'cherry': 'Red',
    'mehroon': 'Red', 'mehrun': 'Red', 'merun': 'Red', 'surkh': 'Red',
    // Beige (separate from Gold — they are different fashion colors)
    'beige': 'Beige', 'nude': 'Beige', 'camel': 'Beige', 'fawn': 'Beige',
    'khaki': 'Beige', 'khaaki': 'Beige', 'sand': 'Beige', 'oat': 'Beige',
    'linen': 'Beige', 'wheat': 'Beige',
    // White
    'ivory': 'White', 'cream': 'White', 'off white': 'White', 'off-white': 'White',
    'snow': 'White', 'pearl': 'White', 'chalk': 'White',
    // Grey
    'silver': 'Grey', 'ash': 'Grey', 'charcoal': 'Black', 'graphite': 'Black',
    'gray': 'Grey', 'grey': 'Grey', 'slate': 'Grey', 'smoke': 'Grey', 'stone': 'Grey',
    // Pink
    'blush': 'Pink', 'peach': 'Pink', 'rose': 'Pink', 'fuchsia': 'Pink',
    'hot pink': 'Pink', 'baby pink': 'Pink', 'nude pink': 'Pink', 'salmon': 'Pink',
    'dusty pink': 'Pink', 'pastel pink': 'Pink', 'old rose': 'Pink',
    // Purple
    'lavender': 'Purple', 'lilac': 'Purple', 'mauve': 'Purple', 'plum': 'Purple',
    'violet': 'Purple', 'grape': 'Purple', 'wisteria': 'Purple',
    'light purple': 'Purple', 'deep purple': 'Purple', 'dark purple': 'Purple',
    'jamuni': 'Purple', 'baingan': 'Purple',
    // Orange
    'coral': 'Orange', 'terracotta': 'Orange', 'amber': 'Orange',
    'burnt orange': 'Orange', 'apricot': 'Orange', 'pumpkin': 'Orange',
    // Yellow
    'mustard': 'Yellow', 'lemon': 'Yellow', 'saffron': 'Yellow',
    'lemon yellow': 'Yellow', 'pastel yellow': 'Yellow', 'butter': 'Yellow',
    // Gold
    'golden': 'Gold', 'gold': 'Gold', 'antique gold': 'Gold', 'champagne': 'Gold',
    // Teal
    'turquoise': 'Teal', 'aqua': 'Teal', 'cyan': 'Teal', 'seafoam': 'Teal',
    'teal green': 'Teal', 'ferozi': 'Teal',
    // Brown
    'chocolate': 'Brown', 'mocha': 'Brown', 'coffee': 'Brown', 'caramel': 'Brown',
    'tan': 'Brown', 'walnut': 'Brown', 'chestnut': 'Brown',
    // Multicolor
    'multi': 'Multicolor', 'printed': 'Multicolor', 'multi colour': 'Multicolor'
  };
  return map[s.toLowerCase()] || s;
}

function defaultScore(c1, c2) {
  // If either is neutral, moderate compatibility
  if (NEUTRAL_COLORS.has(c1) || NEUTRAL_COLORS.has(c2)) return 0.7;
  return 0.5; // Unknown combination — neutral
}
