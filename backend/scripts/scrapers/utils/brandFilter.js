/**
 * brandFilter.js — SCRAPER_ONLY_BRANDS="Khaadi,Maria B" limits a run to those brands (case-insensitive).
 * Empty/unset means every brand. Shared by the clothing and the shoes/jewelry/watches runners.
 */
export function parseOnlyBrands(value = process.env.SCRAPER_ONLY_BRANDS) {
  return String(value || '').split(',').map((b) => b.trim().toLowerCase()).filter(Boolean);
}

export function brandAllowed(brand, only = parseOnlyBrands()) {
  return only.length === 0 || only.includes(String(brand).toLowerCase());
}
