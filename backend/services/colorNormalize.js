/** Shared color alias map + normalizer (used by recommendationEngine + intentScoring). */

import { COLOR_ALIASES as SHARED_ALIASES } from '../constants/colorVocabulary.js';

// Runtime alias map = shared scraper/search vocabulary plus a few print words
// that should collapse to Multicolor when a user types them as a "color".
const COLOR_ALIASES = {
  ...SHARED_ALIASES,
  printed: 'Multicolor',
  floral: 'Multicolor',
  patterned: 'Multicolor',
  geometric: 'Multicolor',
  abstract: 'Multicolor',
  'tie dye': 'Multicolor',
  ombre: 'Multicolor',
  colourful: 'Multicolor',
  colorful: 'Multicolor'
};

export function normalizeColor(color) {
  if (!color) return null;
  const lower = color.toLowerCase().trim();
  if (COLOR_ALIASES[lower]) return COLOR_ALIASES[lower];
  return color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
}
