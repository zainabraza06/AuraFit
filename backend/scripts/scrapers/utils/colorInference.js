/**
 * colorInference.js
 * Infers one or more colors from a product title/description.
 * Returns a primaryColor and a colors array.
 */

// ─── Color keyword map ────────────────────────────────────────────────────────
const COLOR_MAP = [
  { keywords: ['black', 'onyx', 'jet black', 'charcoal black'], color: 'Black' },
  { keywords: ['white', 'ivory', 'off white', 'off-white', 'cream', 'milk'], color: 'White' },
  { keywords: ['red', 'maroon', 'crimson', 'scarlet', 'rust', 'burgundy', 'wine'], color: 'Red' },
  { keywords: ['blue', 'navy', 'cobalt', 'royal blue', 'sky blue', 'indigo', 'denim', 'teal blue'], color: 'Blue' },
  { keywords: ['green', 'mint', 'olive', 'emerald', 'sage', 'bottle green', 'forest green', 'hunter green'], color: 'Green' },
  { keywords: ['yellow', 'mustard', 'lemon', 'golden yellow', 'saffron'], color: 'Yellow' },
  { keywords: ['pink', 'peach', 'blush', 'rose', 'fuchsia', 'hot pink', 'baby pink', 'tea pink', 'powder pink'], color: 'Pink' },
  { keywords: ['purple', 'violet', 'lavender', 'plum', 'lilac', 'mauve'], color: 'Purple' },
  { keywords: ['orange', 'coral', 'terracotta', 'apricot', 'burnt orange', 'amber'], color: 'Orange' },
  { keywords: ['gold', 'golden', 'fawn', 'beige', 'khaki', 'camel', 'nude', 'skin', 'tan'], color: 'Gold' },
  { keywords: ['grey', 'gray', 'silver', 'ash', 'steel', 'slate'], color: 'Grey' },
  { keywords: ['brown', 'chocolate', 'mocha', 'coffee', 'caramel', 'toffee'], color: 'Brown' },
  { keywords: ['teal', 'turquoise', 'aqua', 'sea green', 'cyan'], color: 'Teal' },
  { keywords: ['multi', 'multicolor', 'floral', 'printed', 'pattern', 'embroidered'], color: 'Multicolor' }
];

/**
 * inferColors(text)
 * Returns { primaryColor, colors[] } from product title + description.
 * Matches all colors found; first match becomes primaryColor.
 */
export function inferColors(text) {
  if (!text) return { primaryColor: 'Multicolor', colors: ['Multicolor'] };
  const lower = text.toLowerCase();

  const found = [];
  for (const entry of COLOR_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      found.push(entry.color);
    }
  }

  if (found.length === 0) return { primaryColor: 'Multicolor', colors: ['Multicolor'] };
  // Deduplicate
  const unique = [...new Set(found)];
  return { primaryColor: unique[0], colors: unique };
}

/** Legacy single-color helper for backward compatibility */
export function inferColor(text) {
  return inferColors(text).primaryColor;
}
