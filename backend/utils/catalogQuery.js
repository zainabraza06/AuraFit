const ALLOWED_GENDER = new Set(['women', 'men', 'kids', 'unisex']);

/**
 * Mutates `query` with { gender } or { gender: { $in: [...] } } from ?gender=men or ?gender=men,women
 */
/** Normalised list of allowed genders from a raw value ("men", "men,women", ["women"]), or null for "no filter". */
export function parseGenderFilter(genderRaw) {
  if (genderRaw === undefined || genderRaw === null || genderRaw === '') return null;
  const parts = (Array.isArray(genderRaw) ? genderRaw : String(genderRaw).split(','))
    .map((s) => String(s).toLowerCase().trim())
    .filter((s) => ALLOWED_GENDER.has(s));
  return parts.length ? parts : null;
}

export function attachGenderFilter(query, genderRaw) {
  const parts = parseGenderFilter(genderRaw);
  if (!parts) return;
  if (parts.length === 1) query.gender = parts[0];
  else query.gender = { $in: parts };
}
