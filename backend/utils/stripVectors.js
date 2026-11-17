/**
 * stripVectors — remove raw embedding vectors from anything about to be sent to a client.
 *
 * The recommendation engine needs `embedding` on the documents it scores, and those same documents used to be
 * returned as they were: GET /api/recommendations/:id was ~310 KB, almost all of it 1,024-number vectors, and
 * internal data the client has no use for. Cut them at the response boundary (deep, any nesting, arrays included).
 */
const VECTOR_KEYS = new Set(['embedding', 'imageEmbedding']);

export function stripVectors(value) {
  if (Array.isArray(value)) return value.map(stripVectors);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (typeof value.toObject === 'function') return stripVectors(value.toObject());
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (VECTOR_KEYS.has(k)) continue;
      out[k] = stripVectors(v);
    }
    return out;
  }
  return value;
}
