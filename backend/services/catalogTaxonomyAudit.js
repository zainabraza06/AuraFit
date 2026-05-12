/**
 * Fast lexical check: does product text support stored taxonomy fields?
 * No LLM calls — safe to run on every outfit response for top-N results.
 */

const SUB_SYNONYMS = {
  '2-piece': ['2 piece', 'two piece', '2-piece', 'two-piece', 'shirt trouser', 'kameez trouser'],
  '3-piece': ['3 piece', 'three piece', '3-piece', 'dupatta'],
  kurta: ['kurta', 'kurti', 'kameez', 'shirt'],
  dupatta: ['dupatta', 'dopatta', 'shawl', 'stole'],
  pants: ['pant', 'trouser', 'shalwar', 'palazzo'],
  western: ['western', 'jean', 'denim', 'top', 'tee', 'shirt'],
  bridal: ['bridal', 'wedding', 'barat', 'valima', 'nikah'],
  unstitched: ['unstitched', 'fabric', 'yard']
};

const DRESS_SYNONYMS = {
  lehenga: ['lehenga', 'lehnga', 'gharara', 'sharara'],
  'shalwar-kameez': ['shalwar', 'salwar', 'kameez suit', 'lawn suit'],
  frock: ['frock', 'maxi', 'gown'],
  saree: ['saree', 'sari'],
  western: ['western', 'co-ord', 'hoodie', 'jeans']
};

function hay(product) {
  return [
    product.name,
    product.description,
    product.brand,
    ...(product.tags || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function countHits(text, phrases) {
  return phrases.filter((p) => text.includes(p)).length;
}

/**
 * @param {Record<string, unknown>} product — clothing lean
 * @returns {{ score: number, flags: string[] }}
 */
export function lexicalTaxonomyAlignment(product) {
  const text = hay(product);
  const flags = [];
  let hits = 0;
  let checks = 0;

  const sub = (product.subCategory || '').toLowerCase();
  if (sub && SUB_SYNONYMS[sub]) {
    checks++;
    const c = countHits(text, SUB_SYNONYMS[sub]);
    if (c > 0) {
      hits++;
    } else {
      flags.push(`subCategory "${sub}" weak in text`);
    }
  }

  const ds = (product.dressStyle || '').toLowerCase();
  if (ds && DRESS_SYNONYMS[ds]) {
    checks++;
    const c = countHits(text, DRESS_SYNONYMS[ds]);
    if (c > 0) {
      hits++;
    } else {
      flags.push(`dressStyle "${ds}" weak in text`);
    }
  }

  const score = checks === 0 ? 1 : hits / checks;
  return { score: parseFloat(score.toFixed(2)), flags };
}

export function summarizeCatalogHealth(products) {
  if (!products.length) {
    return { avgLexicalAlignment: 1, perItem: [] };
  }
  const perItem = products.map((p) => {
    const { score, flags } = lexicalTaxonomyAlignment(p);
    return { id: String(p._id), score, flags };
  });
  const avg =
    perItem.reduce((s, x) => s + x.score, 0) / perItem.length;
  return {
    avgLexicalAlignment: parseFloat(avg.toFixed(2)),
    perItem
  };
}
