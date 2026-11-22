/**
 * searchEval.js — offline relevance metrics for search, with predicate-based judgments.
 *
 * Product ids change on every scrape, so judgments are written as ATTRIBUTE PREDICATES, not id lists:
 *   { id, query, catalog?, clauses: [ { any: ['white','ivory'], fields?: 'color' }, { any: ['kurta','kurti'] } ] }
 * A product is RELEVANT when every clause matches. Because a predicate can be run over the whole catalog,
 * the full relevant set is known, so recall@k is real recall (not just precision on the returned page).
 *
 * Metrics per query (k = cutoff): precision@k, recall@k, reciprocal rank, nDCG@k (gain = clauses satisfied).
 */

const norm = (s) => String(s ?? '').toLowerCase();

function wordRe(term) {
  const esc = String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}`, 'i'); // prefix match on a word boundary: "kurta" matches "kurtas"
}

function textBlob(p) {
  return norm([p.name, p.description, ...(p.tags || []), p.dressStyle, p.subCategory, p.shoeType, p.jewelryType, p.watchType, p.category].join(' '));
}

function colorBlob(p) {
  return norm([p.primaryColor, p.primaryExactColor, ...(p.colors || []), ...(p.exactColors || []), p.name].join(' '));
}

function clauseMatches(p, clause) {
  const blob = clause.fields === 'color' ? colorBlob(p) : clause.fields === 'name' ? norm(p.name) : textBlob(p);
  return clause.any.some((t) => wordRe(t).test(blob));
}

/**
 * Number of clauses satisfied (0..clauses.length). A product from a different catalog than the spec asks for scores 0:
 * without this, a jewelry bracelet counted as a hit for "ladies bracelet watch" while the relevant set (watches only)
 * did not contain it, so recall could exceed 1.
 */
export function gradeProduct(p, spec) {
  if (spec.catalog && p.catalog && p.catalog !== spec.catalog) return 0;
  return spec.clauses.reduce((n, c) => n + (clauseMatches(p, c) ? 1 : 0), 0);
}

export function isRelevant(p, spec) {
  return gradeProduct(p, spec) === spec.clauses.length;
}

/** Count and sample of relevant products in a full catalog scan. */
export function relevantSet(allProducts, spec) {
  return allProducts.filter((p) => (!spec.catalog || p.catalog === spec.catalog) && isRelevant(p, spec));
}

/**
 * @param {Array<object>} ranked results in rank order
 * @param {object} spec golden spec
 * @param {number} relevantTotal size of the full relevant set
 * @param {number} k cutoff
 */
export function queryMetrics(ranked, spec, relevantTotal, k = 10) {
  const top = ranked.slice(0, k);
  const grades = top.map((p) => gradeProduct(p, spec));
  const rel = grades.map((g) => g === spec.clauses.length);
  const hits = rel.filter(Boolean).length;
  const firstHit = rel.indexOf(true);

  const dcg = grades.reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0);
  const ideal = [...Array(Math.min(k, Math.max(relevantTotal, 0))).keys()].reduce((s, i) => s + (2 ** spec.clauses.length - 1) / Math.log2(i + 2), 0);

  return {
    precision: top.length ? hits / top.length : 0,
    recall: relevantTotal > 0 ? hits / Math.min(relevantTotal, k) : null, // capped: can't retrieve more than k
    rr: firstHit === -1 ? 0 : 1 / (firstHit + 1),
    // Ideal ranking = every relevant item first. Partially relevant items can push DCG above that ideal
    // when few fully-relevant items exist, so cap at 1.
    ndcg: ideal > 0 ? Math.min(1, dcg / ideal) : null,
    hits,
    relevantTotal,
  };
}

const mean = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Aggregate per-query metrics. Queries with no relevant products in the catalog are reported, not averaged. */
export function aggregate(perQuery) {
  const scored = perQuery.filter((q) => q.metrics.relevantTotal > 0);
  return {
    queries: perQuery.length,
    scored: scored.length,
    unanswerable: perQuery.filter((q) => q.metrics.relevantTotal === 0).map((q) => q.id),
    precision: mean(scored.map((q) => q.metrics.precision)),
    recall: mean(scored.map((q) => q.metrics.recall)),
    mrr: mean(scored.map((q) => q.metrics.rr)),
    ndcg: mean(scored.map((q) => q.metrics.ndcg)),
  };
}

/** Compare to a stored baseline; returns the list of regressions larger than `tolerance`. */
export function regressions(current, baseline, tolerance = 0.05) {
  if (!baseline) return [];
  return ['precision', 'recall', 'mrr', 'ndcg']
    .filter((m) => current[m] != null && baseline[m] != null && current[m] < baseline[m] - tolerance)
    .map((m) => `${m}: ${current[m].toFixed(3)} < baseline ${baseline[m].toFixed(3)} (tolerance ${tolerance})`);
}
