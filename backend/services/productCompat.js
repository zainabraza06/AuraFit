/**
 * Maps ClothingProduct lean documents to the API response shape expected by
 * the frontend and recommendation scoring (print, stitching, pieces aliases).
 */

/** @param {string|undefined} pattern */
export function patternToClientPrint(pattern) {
  if (!pattern) return undefined;
  const p = String(pattern).toLowerCase();
  if (['embroidered', 'embellished', 'mixed'].includes(p)) return 'embroidered';
  if (['plain', 'textured'].includes(p)) return 'plain';
  if (['printed', 'digital-print', 'floral', 'geometric'].includes(p)) return 'printed';
  return 'mixed';
}

/** @param {import('mongoose').LeanDocument<any>} doc */
export function pieceCountFromClothing(doc) {
  const n = doc?.pieceDetails?.totalCount;
  if (typeof n === 'number' && n >= 1 && n <= 4) return n;
  const pt = doc?.pieceType;
  if (pt === '1-piece') return 1;
  if (pt === '2-piece') return 2;
  if (pt === '3-piece') return 3;
  if (pt === '4-piece') return 4;
  return undefined;
}

/**
 * @param {Record<string, unknown>|null|undefined} doc — ClothingProduct .lean()
 * @returns {Record<string, unknown>}
 */
export function formatClothingForApi(doc) {
  if (!doc) return doc;
  const stitching =
    doc.stitchedType === 'semi-stitched' ? 'stitched' : doc.stitchedType || doc.stitching;
  const print = patternToClientPrint(doc.pattern) ?? doc.print;
  const pieces = pieceCountFromClothing(doc) ?? doc.pieces;
  return {
    ...doc,
    category: doc.category || 'clothing',
    stitching: stitching || doc.stitching,
    print: print || doc.print,
    pieces: pieces ?? doc.pieces
  };
}

/** Map chat intent print filter → ClothingProduct.pattern $in values */
export function intentPrintToPatterns(intentPrint) {
  if (!intentPrint) return [];
  const x = String(intentPrint).toLowerCase();
  if (x === 'embroidered' || x === 'embellished') {
    return ['embroidered', 'embellished', 'mixed'];
  }
  if (x === 'plain') return ['plain', 'textured'];
  if (x === 'printed') return ['printed', 'digital-print', 'floral', 'geometric'];
  if (x === 'mixed') return ['mixed', 'embroidered', 'printed', 'embellished'];
  return [intentPrint];
}
