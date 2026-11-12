/**
 * textClean.js — turn scraped HTML-ish text into clean plain text.
 *
 * Why: stripping tags alone left entities like "&amp;" and "&nbsp;" in stored
 * names/descriptions (≈20% of clothing rows), which showed up in the UI and
 * polluted the embedding text. Dependency-free so every vertical can share it.
 */

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', frac12: '½', frac14: '¼', frac34: '¾',
  eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä',
};

/** Decodes named and numeric (&#38; / &#x26;) entities. Unknown entities are left as-is. */
export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** Tags -> spaces, entities decoded, whitespace collapsed. Decoding happens AFTER tag removal so "&lt;b&gt;" stays text. */
export function stripHtml(html, maxLen = Infinity) {
  const noTags = String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|div|h[1-6]|tr)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(noTags).replace(/[ ​]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/** Product title: same cleaning, plus fix doubled spaces and stray separators. */
export function cleanName(name) {
  return stripHtml(name).replace(/\s+([,.;:])/g, '$1').replace(/^[-–—|]+\s*|\s*[-–—|]+$/g, '').trim();
}
