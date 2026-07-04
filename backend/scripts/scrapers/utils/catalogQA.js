/**
 * catalogQA.js — inline field-consistency checker for the scraper pipeline.
 *
 * Ported and improved from catalog_field_consistency_check.py with three fixes
 * that address false-positive sources documented in the issues CSV:
 *
 *   1. FABRIC modifier stripping — "Yarn Dyed Cotton Silk" ≡ "Yarn Cotton Silk".
 *      The scraper often drops adjectives like "Dyed" from the fabric field.
 *      Strip a known filler-word list before comparing so these don't flag as HARD.
 *
 *   2. FABRIC synonym map — brand-specific names to base fabric.
 *      "Munaar Lurex" (Gul Ahmed brand name) → canonical "Lurex".
 *      "Polyester Zari Stripes" → the fabric is polyester, not zari.
 *
 *   3. COLOR denylist — skip the COLOR check when "Color:" contains a print
 *      style, not a color name. "Color: Digital Printed" / "Color: Printed"
 *      appear in Sana Safinaz descriptions; they describe the print finish, not
 *      the hue, and must not be compared against exactColors.
 *
 * Severity:
 *   HARD — field and description fundamentally disagree (different fabric families,
 *           wrong piece count, stitching mismatch). Triggers LLM repair.
 *   SOFT — modifier / synonym / shade difference; log as warning, no repair.
 */

// Words that commonly appear as modifiers in brand descriptions but get dropped
// when the scraper extracts the bare fabric name. Stripping them before the
// comparison prevents "Yarn Cotton Silk" vs "Yarn Dyed Cotton Silk" false flags.
const FABRIC_FILLER = new Set([
  'dyed', 'pure', 'premium', 'woven', 'yarn', 'printed',
  'processed', 'pre', 'treated', 'embroidered', 'digital',
]);

// Brand-specific fabric names → canonical base fabric.
// Checked via substring so order matters — longest match first.
const FABRIC_SYNONYMS = [
  ['munaar lurex',       'lurex'],
  ['munaar',             'lurex'],
  ['korean raw silk',    'rawsilk'],
  ['raw silk',           'rawsilk'],
  ['cambric cotton',     'cambric'],
  ['cotton cambric',     'cambric'],
  ['cotton lawn',        'lawn'],
  ['lawn cotton',        'lawn'],
  ['polyester chiffon',  'chiffon'],
  ['silk chiffon',       'chiffon'],
  ['silk blend',         'silk'],
  // "Polyester Zari Stripes Dupatta" → the fabric is polyester, not zari.
  // The product NAME contains "Polyester" as the fabric; "Zari" is the stripe type.
  ['polyester zari',     'polyester'],
  ['zari stripe',        'polyester'],
];

// Values that appear after "Color:" in descriptions that are print styles / finish
// types, not actual color words. Skip the COLOR check when the label is one of these.
const NON_COLOR_LABELS = new Set([
  'digital printed', 'digital print', 'printed', 'embroidered', 'plain',
  'self', 'screen print', 'screen printed', 'block print', 'block printed',
  'yarn dyed', 'woven',
]);

// ── Labeled-field extractor ───────────────────────────────────────────────────
// Mirrors Python's extract_labeled_field(): captures text after "Label:" up to
// the next Title-Case label, a period, or a known section marker.
const STOP_PATTERN = '(?=[A-Z][a-zA-Z]*\\s*:)|$|\\.|(?:what you|fit:|model|design:|shirt:|trouser:|dupatta:|shawl:|slip:|weight|all fabric)';

function extractLabeledField(desc, label) {
  const re = new RegExp(
    `${label}\\s*:\\s*([A-Za-z0-9 /\\-]+?)(?=${STOP_PATTERN})`,
    'gi',
  );
  const hits = [];
  let m;
  while ((m = re.exec(desc)) !== null) {
    const v = m[1].trim().replace(/\.$/, '');
    if (v) hits.push(v);
  }
  return hits;
}

// ── Normalizers ───────────────────────────────────────────────────────────────
/** Strip all non-alphanumeric, lowercase — for tight equality/substring checks. */
function norm(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Split into lowercase word tokens. */
function words(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

/** Remove filler modifier words then compact — for soft/modifier comparisons. */
function stripFillers(s) {
  return words(s).filter(w => !FABRIC_FILLER.has(w)).join('');
}

/** Resolve a brand-specific synonym to a canonical base fabric string. */
function resolveSynonym(s) {
  const lc = String(s ?? '').toLowerCase().trim();
  for (const [from, to] of FABRIC_SYNONYMS) {
    if (lc.includes(from)) return to;
  }
  return lc;
}

// ── Individual checks ─────────────────────────────────────────────────────────

function checkFabric(product) {
  const desc = product.description || '';
  const fabricField = (product.fabric ?? '').trim();
  const labels = extractLabeledField(desc, 'Fabric');
  if (!fabricField || !labels.length) return null;

  const fn   = norm(fabricField);
  const fFill = stripFillers(fabricField);
  const fSyn  = norm(resolveSynonym(fabricField));

  for (const label of labels) {
    const ln    = norm(label);
    const lFill = stripFillers(label);
    const lSyn  = norm(resolveSynonym(label));

    // Exact / substring match in either direction
    if (fn === ln || fn.includes(ln) || ln.includes(fn)) return null;

    // Synonym match (brand name resolves to same base fabric)
    if (fSyn === lSyn || fSyn.includes(lSyn) || lSyn.includes(fSyn)) return null;

    // Filler-stripped match → same fabric, just a missing modifier word (SOFT)
    if (fFill && lFill && (fFill === lFill || fFill.includes(lFill) || lFill.includes(fFill))) {
      return {
        severity: 'soft',
        type: 'FABRIC',
        detail: `field='${fabricField}' vs description='${label}' (modifier word difference only)`,
      };
    }
  }

  // No match after all resolution attempts → genuinely wrong field (HARD)
  return {
    severity: 'hard',
    type: 'FABRIC',
    detail: `field='${fabricField}' but description states Fabric=${JSON.stringify(labels)}`,
  };
}

function checkColor(product) {
  const desc = product.description || '';
  const labels = extractLabeledField(desc, 'Color');
  const exactColors = (product.exactColors ?? []).map(c => norm(c));
  if (!labels.length || !exactColors.length) return null;

  // Last Color: label is most authoritative (matches Python logic)
  const authoritative = labels[labels.length - 1].trim();
  const authNorm = norm(authoritative);

  // Skip — print style, not a color name
  if (NON_COLOR_LABELS.has(authoritative.toLowerCase())) return null;
  // Skip — too short to be meaningful
  if (authNorm.length <= 2) return null;

  // Full label matches any exactColor
  const fullMatch = exactColors.some(ec => authNorm === ec || authNorm.includes(ec) || ec.includes(authNorm));
  if (fullMatch) return null;

  // Any meaningful word in the label matches an exactColor
  // (handles "Candlelight Pink" → "pink", "Peacock Blue" → "blue")
  const authWords = words(authoritative).filter(w => w.length > 3);
  const wordMatch = authWords.some(w => exactColors.some(ec => ec.includes(w) || w.includes(ec)));
  if (wordMatch) return null;

  // Color mismatches are usually shade/synonym gaps — SOFT unless very wide
  return {
    severity: 'soft',
    type: 'COLOR',
    detail: `description Color='${authoritative}' not reflected in exactColors=${JSON.stringify(product.exactColors)} (primaryColor='${product.primaryColor}')`,
  };
}

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4 };

/**
 * Piece count from a STRUCTURED phrase only — a bare "N PC" is unreliable because
 * these descriptions open with an embroidery breakdown ("1 PC Embroidered Front,
 * 2 PC Sleeves, 1 PC Border …") that is NOT the number of garments. We trust:
 *   - a bare count in the clean TITLE, or
 *   - "Unstitched N-Piece" / "N Pc Outfit" / "N Piece Suit" in the description.
 */
function structuredPieceCount(name, desc) {
  const title = (name || '').toLowerCase();
  let m = title.match(/\b([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\b/) || title.match(/\b(one|two|three|four)[\s-]piece\b/);
  if (m) return WORD_NUM[m[1]] || parseInt(m[1], 10);
  const head = (desc || '').toLowerCase().slice(0, 120);
  m =
    head.match(/\bunstitched\s+([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\b/) ||
    head.match(/\b([1-4])\s*[- ]?\s*(?:pc|pcs|piece|pieces)\s+(?:outfit|suit|stitched|unstitched)\b/) ||
    head.match(/\b(one|two|three|four)[\s-]piece\s+(?:outfit|suit)\b/);
  if (m) return WORD_NUM[m[1]] || parseInt(m[1], 10);
  return null;
}

function checkPieceCount(product) {
  const total = product.pieceDetails?.totalCount;
  if (!total) return null;

  const mentioned = structuredPieceCount(product.name, product.description);
  if (mentioned && mentioned !== total) {
    return {
      severity: 'hard',
      type: 'PIECE_COUNT',
      detail: `pieceDetails.totalCount=${total} but text states ${mentioned}-piece (pieceType='${product.pieceType}')`,
    };
  }
  return null;
}

function checkStitchedType(product) {
  const text = `${product.description ?? ''} ${product.name ?? ''}`.toLowerCase();
  if (product.stitchedType === 'stitched' && /\bunstitched\b/.test(text)) {
    return {
      severity: 'hard',
      type: 'STITCHED_TYPE',
      detail: `field='stitched' but description contains 'Unstitched'`,
    };
  }
  return null;
}

function checkGender(product) {
  const text = `${product.description ?? ''} ${product.name ?? ''}`.toLowerCase();
  if (product.gender === 'women' && /\bmen'?s\b/.test(text) && !/\bwomen/.test(text)) {
    return { severity: 'soft', type: 'GENDER', detail: `field='women' but text mentions men's only` };
  }
  if (product.gender === 'men' && /\bwomen\b|\bladies\b/.test(text)) {
    return { severity: 'soft', type: 'GENDER', detail: `field='men' but text mentions women/ladies` };
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────
const CHECKS = [checkFabric, checkColor, checkPieceCount, checkStitchedType, checkGender];

/**
 * Run all consistency checks on a normalized product object.
 *
 * @param {object} product — fully normalized product (output of normalizeProduct)
 * @returns {{ hard: object[], soft: object[] }}
 *   hard — field is fundamentally wrong; candidate for LLM repair
 *   soft — modifier/synonym/shade gap; log as warning only
 */
export function checkConsistency(product) {
  const hard = [], soft = [];
  for (const check of CHECKS) {
    const issue = check(product);
    if (!issue) continue;
    (issue.severity === 'hard' ? hard : soft).push(issue);
  }
  return { hard, soft };
}

/**
 * Convenience wrapper — returns true when any hard issue was found.
 * Use this to gate the tryRepairWithLLM call.
 */
export function needsRepair(product) {
  return CHECKS.some(fn => { const r = fn(product); return r?.severity === 'hard'; });
}
