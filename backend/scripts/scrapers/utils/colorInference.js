/**
 * colorInference.js
 * Infers colors from a product title/description.
 *
 * Returns two parallel sets:
 *   primaryColor / colors       — canonical family names (unchanged, used everywhere existing)
 *   primaryExactColor / exactColors — the literal keyword matched from the product text
 */

const COLOR_MAP = [
  { keywords: ['black', 'onyx', 'jet black', 'charcoal black'], color: 'Black' },
  { keywords: ['white', 'ivory', 'off white', 'off-white', 'cream', 'milk'], color: 'White' },
  { keywords: ['red', 'maroon', 'crimson', 'scarlet', 'rust', 'burgundy', 'wine', 'mehroon', 'mehrun', 'laal'], color: 'Red' },
  { keywords: ['navy blue', 'royal blue', 'sky blue', 'teal blue', 'cobalt', 'indigo', 'denim', 'navy', 'blue'], color: 'Blue' },
  { keywords: ['bottle green', 'forest green', 'sea green', 'mint green', 'hunter green', 'army green', 'parrot green', 'mehendi green', 'pista', 'pistachio', 'emerald', 'olive', 'mint', 'sage', 'lime', 'dhani', 'mehendi', 'sabz', 'green'], color: 'Green' },
  { keywords: ['mustard', 'lemon yellow', 'golden yellow', 'saffron', 'lemon', 'yellow', 'zard', 'peela'], color: 'Yellow' },
  { keywords: ['hot pink', 'baby pink', 'dusty pink', 'blush pink', 'rose pink', 'nude pink', 'fuchsia', 'magenta', 'blush', 'peach', 'rose', 'salmon', 'gulabi', 'pink'], color: 'Pink' },
  { keywords: ['lavender', 'lilac', 'mauve', 'plum', 'violet', 'grape', 'jamuni', 'baingan', 'purple'], color: 'Purple' },
  { keywords: ['burnt orange', 'terracotta', 'coral', 'apricot', 'amber', 'tangerine', 'mango', 'narangi', 'orange'], color: 'Orange' },
  { keywords: ['antique gold', 'rose gold', 'dull gold', 'golden', 'champagne', 'bronze', 'fawn', 'camel', 'nude', 'khaki', 'sand', 'beige', 'gold'], color: 'Gold' },
  { keywords: ['steel grey', 'charcoal grey', 'dove grey', 'light grey', 'dark grey', 'silver', 'slate', 'ash', 'gray', 'grey'], color: 'Grey' },
  { keywords: ['dark brown', 'chocolate', 'mocha', 'coffee', 'caramel', 'toffee', 'walnut', 'chestnut', 'tan', 'brown'], color: 'Brown' },
  { keywords: ['peacock blue', 'teal green', 'dark teal', 'turquoise', 'ferozi', 'firozi', 'aqua', 'cyan', 'teal'], color: 'Teal' },
  { keywords: ['multi', 'multicolor', 'multi-color', 'multicolour', 'printed', 'floral', 'patterned', 'abstract', 'ombre', 'tie dye'], color: 'Multicolor' }
];

/**
 * inferColors(text)
 *
 * Returns:
 *   primaryColor      — canonical family, e.g. "Red"      (original field, unchanged)
 *   colors            — canonical families, e.g. ["Red"]  (original field, unchanged)
 *   primaryExactColor — exact scraped shade, e.g. "maroon" (new field)
 *   exactColors       — all exact shades found, e.g. ["maroon"] (new field)
 */
export function inferColors(text) {
  const fallback = {
    primaryColor: 'Multicolor',
    colors: ['Multicolor'],
    primaryExactColor: 'multicolor',
    exactColors: ['multicolor']
  };

  if (!text) return fallback;
  const lower = text.toLowerCase();

  const found = []; // { exact: keyword, family: canonical }
  const seenFamilies = new Set();

  for (const entry of COLOR_MAP) {
    for (const kw of entry.keywords) {
      const escaped = kw.replace(/[-]/g, '[-\\s]?');
      const regex = new RegExp(`\\b${escaped}\\b`);
      if (regex.test(lower)) {
        if (!seenFamilies.has(entry.color)) {
          seenFamilies.add(entry.color);
          found.push({ exact: kw, family: entry.color });
        }
        break;
      }
    }
  }

  if (found.length === 0) return fallback;

  return {
    primaryColor: found[0].family,          // canonical — e.g. "Red"
    colors: found.map((f) => f.family),     // canonical — e.g. ["Red", "Gold"]
    primaryExactColor: found[0].exact,      // exact     — e.g. "maroon"
    exactColors: found.map((f) => f.exact)  // exact     — e.g. ["maroon", "golden"]
  };
}

/** Legacy single-color helper */
export function inferColor(text) {
  return inferColors(text).primaryColor;
}
