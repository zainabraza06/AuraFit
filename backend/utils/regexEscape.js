/**
 * Escape a string for safe use inside a JavaScript RegExp (user / LLM input).
 * @param {string} s
 */
export function escapeRegex(s) {
  return String(s ?? '').replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
}
