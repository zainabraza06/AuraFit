/**
 * Shoes, jewelry, watches — scored in memory from pre-fetched pools (fast).
 */
import { getColorArrayCompatibility, getColorCompatibilityScore } from './colorTheory.js';
import { normalizeColor } from './colorNormalize.js';

const BOLD_DRESS = new Set(['Red', 'Pink', 'Orange', 'Yellow', 'Purple', 'Teal', 'Blue', 'Green']);
const NEUTRAL_SHOE = new Set(['Black', 'White', 'Grey', 'Gold', 'Beige', 'Brown', 'Multicolor']);

function dressColorFamilies(dress) {
  const raw = [dress.primaryColor, ...(dress.colors || [])].filter(Boolean);
  const fam = raw.map((c) => normalizeColor(String(c)) || c);
  return [...new Set(fam)];
}

function shoeColorFamilies(shoe) {
  const raw = [shoe.primaryColor, ...(shoe.colors || [])].filter(Boolean);
  return raw.map((c) => normalizeColor(String(c)) || c);
}

/** Contrast-aware + occasion + silhouette fit for footwear. */
export function footwearFashionScore(dress, shoe) {
  const dFam = dressColorFamilies(dress);
  const sFam = shoeColorFamilies(shoe);
  let colorBest = 0;
  for (const d of dFam) {
    for (const s of sFam) {
      colorBest = Math.max(colorBest, getColorCompatibilityScore(d, s));
    }
  }
  const primaryDress = normalizeColor(dress.primaryColor || '') || dress.primaryColor;
  const primaryShoe = normalizeColor(shoe.primaryColor || '') || shoe.primaryColor;
  let contrastBoost = 0;
  if (BOLD_DRESS.has(String(primaryDress)) && NEUTRAL_SHOE.has(String(primaryShoe))) {
    contrastBoost = 0.08;
  }
  if (String(primaryDress) === String(primaryShoe)) contrastBoost += 0.05;

  const occD = (dress.occasion || []).map((o) => o.toLowerCase());
  const occS = (shoe.occasion || []).map((o) => o.toLowerCase());
  const occHit = occD.some((o) => occS.includes(o)) ? 0.18 : 0.06;

  const shoeType = (shoe.shoeType || '').toLowerCase();
  const formalish = ['wedding', 'bridal', 'formal', 'party', 'eid'].some((o) => occD.includes(o));

  // Eastern traditional silhouettes (shalwar-kameez/kurta/lehenga/saree/abaya)
  // are never paired with Western athletic footwear in real global or
  // Pakistani styling standards — that's a silhouette mismatch, not a
  // formality question, so "casual" occasion must NOT unlock sneakers/
  // trainers/joggers here the way it correctly does for Western dressStyle.
  // (Bug this fixes: an unstitched lawn 2-piece suit — occasion "casual",
  // dressStyle "shalwar-kameez" — was scoring sneakers/joggers as highly as
  // proper eastern footwear, since the old rule only checked occasion.)
  const EASTERN_STYLES = new Set(['shalwar-kameez', 'kurta', 'lehenga', 'saree', 'abaya', 'sherwani']);
  const isEastern = EASTERN_STYLES.has((dress.dressStyle || '').toLowerCase());
  const ATHLETIC = /sneaker|trainer|jogger|running|basketball/;
  const EASTERN_FOOTWEAR = /khussa|kohati|kolhapuri|peshawari|sandal|chappal|wedge|mule|slide|slipper/;
  const WESTERN_CASUAL = /sneaker|trainer|jogger|flat|slide|sandal|loafer/;

  let silhouette = 0.1;
  const eastAthleticMismatch = isEastern && ATHLETIC.test(shoeType);
  if (formalish && /heel|stiletto|pump|bridal|khussa|kolhapuri|mule/.test(shoeType)) silhouette = 0.22;
  else if (isEastern) {
    if (!formalish && EASTERN_FOOTWEAR.test(shoeType)) silhouette = 0.2;
  } else if (!formalish && WESTERN_CASUAL.test(shoeType)) {
    silhouette = 0.2;
  }
  if (occD.includes('office') && /loafer|pump|heel|oxford|flat/.test(shoeType)) silhouette = 0.2;

  let total = Math.min(1, colorBest + contrastBoost + occHit + silhouette);
  // Multiplicative, applied AFTER the ceiling clamp — an additive penalty on
  // "silhouette" alone gets swallowed whenever color+contrast+occasion already
  // sum past 1 (exactly what let sneakers tie with slippers at score 1 despite
  // the fix above: strong color/occasion match papered over the mismatch).
  if (eastAthleticMismatch) total *= 0.12;
  return parseFloat(total.toFixed(3));
}

export function explainFootwearChoice(dress, shoe) {
  const parts = [];
  const df = dress.primaryColor || 'outfit';
  const sf = shoe.primaryColor || 'neutral';
  parts.push(`${sf} footwear balances the ${df} ensemble (color harmony + contrast)`);
  const shared = (dress.occasion || []).filter((o) =>
    (shoe.occasion || []).map((x) => String(x).toLowerCase()).includes(String(o).toLowerCase())
  );
  if (shared.length) parts.push(`works for ${shared.slice(0, 2).join(' & ')}`);
  if ((shoe.shoeType || '').includes('heel')) parts.push('heel height suits dressier occasions');
  return parts.join(' · ');
}

export function pickBestShoe(dress, shoePool, usedIds = new Set()) {
  const pool = shoePool.filter((s) => s._id && !usedIds.has(String(s._id)));
  if (!pool.length) return null;
  let best = null;
  let bestScore = -1;
  for (const shoe of pool) {
    const base = footwearFashionScore(dress, shoe);
    const score = base;
    if (score > bestScore) {
      bestScore = score;
      best = shoe;
    }
  }
  if (best) usedIds.add(String(best._id));
  return best
    ? {
        product: best,
        score: bestScore,
        reason: explainFootwearChoice(dress, best)
      }
    : null;
}

function jewelryWeight(intentOccasions, jType) {
  const occ = (intentOccasions || []).map((o) => o.toLowerCase());
  const heavy = occ.some((o) => ['wedding', 'bridal', 'mehndi', 'barat', 'valima'].includes(o));
  const minimal = occ.every((o) => ['office', 'casual'].includes(o));
  if (heavy && /bridal-set|jhumka|chandbali|necklace|choker|nath|tikka|jhoomar/.test(jType)) return 1.2;
  if (minimal && /stud|minimal|chain|bracelet/.test(jType)) return 1.15;
  return 1;
}

export function scoreJewelryForDress(dress, jewelry, intentOccasions) {
  const col = getColorArrayCompatibility(
    [dress.primaryColor, ...(dress.colors || [])].filter(Boolean),
    [jewelry.primaryColor, ...(jewelry.colors || [])].filter(Boolean)
  );
  const occJ = (jewelry.occasion || []).map((o) => o.toLowerCase());
  const occD = (dress.occasion || []).map((o) => o.toLowerCase());
  const occ = occD.some((o) => occJ.includes(o)) ? 0.35 : 0.12;
  const jt = (jewelry.jewelryType || '').toLowerCase();
  const w = jewelryWeight(intentOccasions, jt);
  return parseFloat((col * 0.45 + occ * w).toFixed(3));
}

export function explainJewelry(dress, jewelry) {
  const metal = jewelry.metalFinish || jewelry.stoneWork || 'finish';
  return `${jewelry.jewelryType || 'piece'} in ${metal} complements ${dress.primaryColor || 'the outfit'} for the occasion tone`;
}

function jewelryFocusScoreMultiplier(jType, wantMinimal, wantStatement) {
  const t = (jType || '').toLowerCase();
  if (wantStatement && !wantMinimal) {
    if (/jhumka|chandbali|bridal-set|necklace|choker|nath|maang-tikka|jhoomar|passa|long-necklace/.test(t)) {
      return 1.18;
    }
    if (/stud|pendant-chain/.test(t)) return 0.92;
  }
  if (wantMinimal && !wantStatement) {
    if (/jhumka|chandbali|bridal-set|jhoomar/.test(t)) return 0.82;
    if (/stud|hoop|pendant-chain|bracelet|ring|anklet/.test(t)) return 1.12;
    if (/necklace|choker/.test(t) && !/long-necklace/.test(t)) return 0.94;
  }
  return 1;
}

export function pickJewelrySet(dress, intentOccasions, pool, opts = {}) {
  const { maxItems = 5, completionFocus = [] } = opts;
  const focus = Array.isArray(completionFocus) ? completionFocus : [];
  const wantMinimal = focus.includes('minimal_jewelry');
  const wantStatement = focus.includes('statement_jewelry');

  const heavy = (intentOccasions || []).some((o) =>
    ['wedding', 'bridal', 'mehndi', 'eid', 'party'].includes(String(o).toLowerCase())
  );
  let cap = heavy ? maxItems : Math.min(3, maxItems);
  if (wantStatement && !wantMinimal) cap = Math.max(cap, Math.min(6, maxItems));
  if (wantMinimal && !wantStatement) cap = Math.min(cap, 2);
  cap = Math.max(1, Math.min(6, cap));

  const scored = pool
    .map((j) => {
      const base = scoreJewelryForDress(dress, j, intentOccasions);
      const mult = jewelryFocusScoreMultiplier(j.jewelryType, wantMinimal, wantStatement);
      return {
        j,
        s: parseFloat((base * mult).toFixed(3))
      };
    })
    .sort((a, b) => b.s - a.s);

  const picked = [];
  const types = new Set();
  for (const { j, s } of scored) {
    if (picked.length >= cap) break;
    const t = j.jewelryType || 'other';
    if (picked.length >= 2 && types.has(t)) continue;
    types.add(t);
    picked.push({
      product: j,
      score: s,
      reason: explainJewelry(dress, j)
    });
  }
  return picked;
}

export function scoreWatchForDress(dress, watch, intentOccasions) {
  const dial = watch.dialColor || watch.primaryColor;
  const col = getColorCompatibilityScore(dress.primaryColor || 'Multicolor', dial || watch.primaryColor || 'Silver');
  const occ = (watch.occasion || []).map((o) => o.toLowerCase());
  const occD = (intentOccasions || []).map((o) => o.toLowerCase());
  const occScore = occD.some((o) => occ.includes(o)) ? 0.35 : 0.15;
  const wt = (watch.watchType || '').toLowerCase();
  let typeBonus = 0.1;
  if (occD.some((o) => ['wedding', 'bridal', 'formal'].includes(o)) && /dress|minimal|analog|chronograph/.test(wt)) {
    typeBonus = 0.22;
  }
  if (occD.includes('casual') && /minimal|sports|digital/.test(wt)) typeBonus = 0.2;
  return parseFloat((col * 0.45 + occScore + typeBonus).toFixed(3));
}

export function pickWatch(dress, intentOccasions, pool) {
  if (!pool.length) return null;
  let best = null;
  let bestS = -1;
  for (const w of pool) {
    const s = scoreWatchForDress(dress, w, intentOccasions);
    if (s > bestS) {
      bestS = s;
      best = w;
    }
  }
  return best
    ? {
        product: best,
        score: bestS,
        reason: `${best.watchType || 'watch'} dial/strap tones pair with the outfit palette and formality`
      }
    : null;
}
