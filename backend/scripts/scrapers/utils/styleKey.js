/**
 * styleKey.js — derive a style code and a colourway group from a product URL.
 *
 * Why: 58% of clothing rows share an identical brand+name with other rows ("RTS | Shirt, Trouser &
 * Dupatta" x110): retailers title many different designs generically and put the real identifier in
 * the URL slug, e.g. .../rts-shirt-trouser-dupatta-ec327-3p26-beige. From the slug we get
 *   styleCode  "EC327-3P26"          what a shopper would quote / search for
 *   styleGroup "alkaram studio:ec327-3p26"   the same design in other colours shares this key
 *   colorToken "beige"
 * so search can show one card per design and the UI can tell identical titles apart.
 */
import { inferColors } from './colorInference.js';

const slugify = (s) => String(s || '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function lastSegment(productUrl) {
  try {
    const seg = new URL(productUrl).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(seg).replace(/\.(html?|php)$/i, '');
  } catch {
    return '';
  }
}

/** True when a single slug token is a colour word (and not a design code like "ec327"). */
function isColorToken(tok) {
  if (!/^[a-z]{3,12}$/.test(tok)) return false;
  return inferColors(tok).primaryExactColor !== 'multicolor' || ['multi', 'multicolor', 'multicolour'].includes(tok);
}

/**
 * @param {{ name: string, productUrl: string, brand?: string }} p
 * @returns {{ styleCode?: string, styleGroup?: string, colorToken?: string }}
 */
export function deriveStyleKey({ name, productUrl, brand = '' }) {
  const seg = slugify(lastSegment(productUrl));
  if (!seg) return {};
  const nameSlug = slugify(name);

  // Remove the part of the slug that merely repeats the title; what is left identifies the design.
  let rest = seg;
  if (nameSlug && seg.startsWith(`${nameSlug}-`)) rest = seg.slice(nameSlug.length + 1);
  else if (nameSlug && seg === nameSlug) return {};
  const tokens = rest.split('-').filter(Boolean);

  // A code must contain a digit; otherwise the "rest" is just words and carries no identity.
  if (!tokens.some((t) => /\d/.test(t))) return {};

  let colorToken;
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && isColorToken(last)) {
    colorToken = last;
    tokens.pop();
  } else if (/_([a-z]+)$/i.test(last)) {
    // Khaadi style: A1G1-26-407FA-E-VG_MULTI -> colour after the underscore
    const m = last.match(/^(.*)_([a-z]+)$/i);
    if (m && isColorToken(m[2].toLowerCase())) { colorToken = m[2].toLowerCase(); tokens[tokens.length - 1] = m[1]; }
  }
  const code = tokens.join('-');
  if (!code) return {};
  return {
    styleCode: code.toUpperCase(),
    styleGroup: `${String(brand).toLowerCase()}:${code}`,
    ...(colorToken ? { colorToken } : {}),
  };
}
