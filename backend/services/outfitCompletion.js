/**
 * Suggests missing coordinate pieces (dupatta, trouser, etc.) from the clothing catalog.
 */
import ClothingProduct from '../models/ClothingProduct.js';
import { formatClothingForApi } from './productCompat.js';

const SELECT =
  'name brand price images primaryColor colors occasion dressStyle subCategory fashionType gender pieceType pieceDetails productUrl';

function occOverlap(dress, candidate) {
  const d = (dress.occasion || []).map((x) => x.toLowerCase());
  return (candidate.occasion || []).some((o) => d.includes(String(o).toLowerCase()));
}

async function findComplement(query, dress, role, reason, limit = 2) {
  const g = dress.gender || 'women';
  const q = {
    ...query,
    gender: { $in: [g, 'unisex'] },
    _id: { $ne: dress._id },
    price: dress.price ? { $lte: Math.round(dress.price * 1.4) } : undefined
  };
  if (q.price === undefined) delete q.price;
  const raw = await ClothingProduct.find(q).select(SELECT).limit(8).lean();
  const scored = raw
    .map((p) => ({
      p,
      s: (occOverlap(dress, p) ? 2 : 0) + (p.primaryColor === dress.primaryColor ? 1 : 0)
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  return scored.map(({ p }) => ({
    product: formatClothingForApi(p),
    role,
    reason
  }));
}

/**
 * @param {object} dress — formatClothingForApi lean
 * @param {object} _intent — reserved for future filters
 * @param {object|null} accessoryPlan — from planAccessorySearchFromContext; completionFocus gates suggestions
 */
export async function suggestOutfitCompletions(dress, _intent = {}, accessoryPlan = null) {
  const focus = accessoryPlan?.completionFocus || [];
  const coordKeys = new Set(['dupatta_eastern', 'bottom_eastern', 'bottom_western']);
  const hasCoordFocus = focus.some((f) => coordKeys.has(f));

  if (focus.includes('none') && !focus.some((f) => f !== 'none')) {
    return [];
  }

  const wantDupatta = !hasCoordFocus || focus.includes('dupatta_eastern');
  const wantBottomEastern = !hasCoordFocus || focus.includes('bottom_eastern');
  const wantBottomWestern = !hasCoordFocus || focus.includes('bottom_western');

  const out = [];
  const includes = (dress.pieceDetails?.includes || []).map((x) => String(x).toLowerCase());
  const pieceType = dress.pieceType || dress.pieces;
  const ft = dress.fashionType || 'eastern';
  const ds = (dress.dressStyle || '').toLowerCase();
  const sub = (dress.subCategory || '').toLowerCase();
  const gender = dress.gender || 'women';

  // Western: top / tee / shirt → bottoms
  if (
    wantBottomWestern &&
    ft === 'western' &&
    gender === 'women' &&
    (ds === 'top' || ds === 't-shirt' || ds === 'polo' || sub.includes('western') || /top|tee|shirt/i.test(dress.name || ''))
  ) {
    const bottoms = await findComplement(
      {
        category: 'clothing',
        $or: [{ dressStyle: 'trouser' }, { subCategory: 'western' }, { name: /jean|denim|trouser|pant/i }]
      },
      dress,
      'bottom',
      'Relaxed denim or wide-leg trousers balance a fitted western top.',
      2
    );
    out.push(...bottoms);
    return out;
  }

  // Eastern incomplete sets
  if (ft !== 'western') {
    const hasDupatta = includes.some((x) => x.includes('dupatta'));
    const hasTrouser = includes.some((x) => /trouser|pant|shalwar|palazzo/.test(x));
    const hasShirt = includes.some((x) => /shirt|kameez|kurta|top/.test(x));

    if (wantDupatta && (pieceType === '2-piece' || sub.includes('2-piece')) && !hasDupatta) {
      const dup = await findComplement(
        { category: 'clothing', subCategory: 'dupatta' },
        dress,
        'dupatta',
        'A coordinating dupatta completes most 2-piece eastern looks.',
        2
      );
      out.push(...dup);
    }

    if (
      wantBottomEastern &&
      hasShirt &&
      hasDupatta &&
      !hasTrouser
    ) {
      const tr = await findComplement(
        {
          category: 'clothing',
          $or: [{ subCategory: 'pants' }, { subCategory: 'shalwar' }, { dressStyle: 'trouser' }]
        },
        dress,
        'bottom',
        'Trousers or shalwar ground the outfit when the shirt and dupatta are set.',
        2
      );
      out.push(...tr);
    }

    if (wantDupatta || wantBottomEastern) {
      if (pieceType === '1-piece' || sub === 'kurta') {
        if (wantDupatta) {
          const dup = await findComplement(
            { category: 'clothing', subCategory: 'dupatta' },
            dress,
            'dupatta',
            'Adds polish to a single kurta or shirt piece.',
            1
          );
          out.push(...dup);
        }
        if (wantBottomEastern) {
          const bot = await findComplement(
            {
              category: 'clothing',
              $or: [{ subCategory: 'pants' }, { subCategory: 'shalwar' }]
            },
            dress,
            'bottom',
            'Pair with bottoms to build a wearable day or event outfit.',
            1
          );
          out.push(...bot);
        }
      }
    }
  }

  return out.slice(0, 5);
}
