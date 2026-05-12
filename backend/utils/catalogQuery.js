const ALLOWED_GENDER = new Set(['women', 'men', 'kids', 'unisex']);

/**
 * Mutates `query` with { gender } or { gender: { $in: [...] } } from ?gender=men or ?gender=men,women
 */
export function attachGenderFilter(query, genderRaw) {
  if (genderRaw === undefined || genderRaw === null || genderRaw === '') return;
  const parts = (Array.isArray(genderRaw) ? genderRaw : String(genderRaw).split(','))
    .map((s) => String(s).toLowerCase().trim())
    .filter((s) => ALLOWED_GENDER.has(s));
  if (parts.length === 0) return;
  if (parts.length === 1) query.gender = parts[0];
  else query.gender = { $in: parts };
}
