/**
 * agent/constraints.js — machine-checkable requirements stated in a shopper's request.
 *
 * LLMs are unreliable at arithmetic and at "did I cover everything I was asked for". These two things can be checked
 * with certainty from the text and the chosen products, so the agent graph verifies them after the model answers and
 * sends it back once with the exact problem. Only constraints that are stated explicitly are enforced; anything
 * ambiguous is left alone (a false "violation" would make a good answer worse).
 */

const CURRENCY = '(?:pkr|rs\\.?|rupees?)';
const AMOUNT = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k\\b)?\\s*${CURRENCY}\\b`, 'i');

const EACH = /\b(each|per piece|per item|every piece|apiece|a piece)\b/i;

/**
 * Budget stated with a currency: "under 8000 PKR", "my budget is 8000 PKR in total", "each piece under 6000 PKR".
 * Without "each/per piece" the amount is a TOTAL for everything recommended. A bare number without PKR/Rs is ignored
 * ("he is 25" is not a budget).
 * @returns {{ total?: number, each?: number }}
 */
export function parseBudget(message) {
  const text = String(message || '');
  const m = AMOUNT.exec(text);
  if (!m) return {};
  const value = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  if (!Number.isFinite(value) || value <= 0) return {};
  return EACH.test(text) ? { each: value } : { total: value };
}

const CATALOG_WORDS = {
  jewelry: /\b(jewel(?:ry|lery)|earrings?|jhumka|jhumki|necklaces?|bangles?|bracelets?|rings?|choker|pendant|tikka|chandbali)\b/i,
  shoes: /\b(shoes?|heels?|sandals?|khussa|khussay|footwear|sneakers?|flats|boots?|slippers?|pumps?|loafers?)\b/i,
  watches: /\b(watch|watches|smartwatch)\b/i,
};

/** Non-clothing catalogs the shopper explicitly asked for (clothing is the default and is not enforced). */
export function requestedCatalogs(message) {
  const text = String(message || '');
  return Object.entries(CATALOG_WORDS).filter(([, re]) => re.test(text)).map(([k]) => k);
}

/**
 * @param {string} message the shopper's request
 * @param {Array<{ catalog?: string, price?: number }>} picks the products the agent chose
 * @returns {{ type: string, detail: string }[]} empty when everything stated is satisfied
 */
export function findViolations(message, picks) {
  const out = [];
  const budget = parseBudget(message);
  const total = picks.reduce((s, p) => s + (Number(p.price) || 0), 0);
  if (budget.total != null && picks.length && total > budget.total) {
    out.push({ type: 'budget_total', detail: `the picks cost ${total} PKR in total but the shopper's budget is ${budget.total} PKR` });
  }
  if (budget.each != null) {
    const over = picks.filter((p) => Number(p.price) > budget.each);
    if (over.length) out.push({ type: 'budget_each', detail: `${over.length} pick(s) cost more than ${budget.each} PKR each (${over.map((p) => p.price).join(', ')})` });
  }
  if (picks.length) {
    const have = new Set(picks.map((p) => p.catalog));
    for (const c of requestedCatalogs(message)) {
      if (!have.has(c)) out.push({ type: 'missing_catalog', detail: `the shopper asked for ${c} but none is included` });
    }
  }
  return out;
}

/** The message sent back to the model when its answer breaks a stated requirement. */
export function violationFeedback(violations) {
  return [
    'Your previous answer does not meet what the shopper asked for:',
    ...violations.map((v) => `- ${v.detail}`),
    'Fix this: search again (use maxPrice and the catalog argument where it helps) and choose different or additional items, then give a new "final" answer. Do not repeat the same picks.',
  ].join('\n');
}
