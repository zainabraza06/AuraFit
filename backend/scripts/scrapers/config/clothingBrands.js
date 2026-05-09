/**
 * clothingBrands.js
 * Comprehensive collection config for all 5 clothing brands.
 * All URLs verified from live site navigation (May 2026).
 *
 * Unified subCategory vocabulary:
 *   '2-piece'            — stitched shirt + bottom (no dupatta)
 *   '3-piece'            — stitched shirt + bottom + dupatta
 *   'kurta'              — single kurta / shirt / kurti / 1-piece
 *   'pants'              — trousers / bottoms only
 *   'shalwar'            — shalwar only
 *   'dupatta'            — dupatta / shawl / stole
 *   'unstitched-2-piece' — unstitched 2-piece fabric set
 *   'unstitched-3-piece' — unstitched 3-piece fabric set
 *   'festive'            — embroidered / bridal / luxury formal
 *   'western'            — western / fusion wear
 *   'other'              — misc / sale
 */

export const CLOTHING_BRANDS = [

  // ════════════════════════════════════════════════════════════════════════════
  // BEECHTREE — beechtree.pk  (Shopify)
  // Menu: UNSTITCHED | PRET | LUXURY PRET | FLOW | ACCESSORIES
  // ════════════════════════════════════════════════════════════════════════════
  {
    brand: 'Beechtree',
    baseUrl: 'https://beechtree.pk',
    adapter: 'BeechtreeAdapter',
    category: 'clothing',
    collections: [
      // ── Stitched Sets ────────────────────────────────────────────────
      { path: '/collections/2-piece',
        subCategory: '2-piece',           occasion: ['casual', 'office'],                style: ['printed', 'minimal'] },
      { path: '/collections/3-piece',
        subCategory: '3-piece',           occasion: ['casual', 'party'],                 style: ['printed', 'elegant'] },
      // ── Pret (RTW) ───────────────────────────────────────────────────
      { path: '/collections/pret',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['trendy', 'minimal'] },
      { path: '/collections/pret-shirts',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['printed', 'minimal'] },
      { path: '/collections/luxury-pret',
        subCategory: '3-piece',           occasion: ['party', 'eid', 'casual'],          style: ['embroidered', 'elegant'] },
      // ── Unstitched ───────────────────────────────────────────────────
      { path: '/collections/unstitched',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'office'],                style: ['printed'] },
      { path: '/collections/unstitched-2-piece-suit',
        subCategory: 'unstitched-2-piece',occasion: ['casual'],                          style: ['printed'] },
      { path: '/collections/unstitched-printed',
        subCategory: 'unstitched-3-piece',occasion: ['casual'],                          style: ['printed'] },
      { path: '/collections/unstitched-embroidered',
        subCategory: 'unstitched-3-piece',occasion: ['party', 'eid'],                    style: ['embroidered', 'elegant'] },
      { path: '/collections/unstitched-embroidered-3-piece',
        subCategory: 'unstitched-3-piece',occasion: ['party', 'eid'],                    style: ['embroidered', 'elegant'] },
      { path: '/collections/luxury-unstitched',
        subCategory: 'festive',           occasion: ['wedding', 'eid', 'party'],         style: ['embroidered', 'elegant'] },
      // ── Bottoms & Western ────────────────────────────────────────────
      { path: '/collections/bottoms',
        subCategory: 'pants',             occasion: ['casual', 'office'],                style: ['minimal'] },
      { path: '/collections/western-wear',
        subCategory: 'western',           occasion: ['casual', 'party'],                 style: ['western', 'trendy'] },
      // ── Sale ─────────────────────────────────────────────────────────
      { path: '/collections/sale',
        subCategory: 'other',             occasion: ['casual'],                          style: ['minimal'] }
    ]
  },

  // ════════════════════════════════════════════════════════════════════════════
  // LIMELIGHT — limelight.pk  (Shopify)
  // Menu: UNSTITCHED (Summer/Embroidered/Printed/Lawn/Bottoms)
  //        RTW (Embroidered/Printed/Solids/Silk/Formals/Kurtis/Bottoms)
  //        CO-ORDS | WESTERN
  // ════════════════════════════════════════════════════════════════════════════
  {
    brand: 'Limelight',
    baseUrl: 'https://www.limelight.pk',
    adapter: 'LimelightAdapter',
    category: 'clothing',
    collections: [
      // ── Pret / RTW ───────────────────────────────────────────────────
      { path: '/collections/pret',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['minimal', 'trendy'] },
      { path: '/collections/short-kurti',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['printed', 'minimal'] },
      { path: '/collections/embroidered-short-kurti',
        subCategory: 'kurta',             occasion: ['party', 'office', 'eid'],          style: ['embroidered', 'elegant'] },
      // ── Unstitched ───────────────────────────────────────────────────
      { path: '/collections/unstitched',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'office'],                style: ['printed'] },
      { path: '/collections/unstitched-summer',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'summer'],                style: ['printed'] },
      { path: '/collections/unstitched-embroidered-summer',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'party'],                 style: ['embroidered', 'printed'] },
      { path: '/collections/embroidered-unstitched',
        subCategory: 'festive',           occasion: ['eid', 'wedding', 'party'],         style: ['embroidered', 'elegant'] },
      { path: '/collections/unstitched-formals',
        subCategory: 'festive',           occasion: ['eid', 'wedding', 'formal'],        style: ['embroidered', 'elegant'] },
      { path: '/collections/unstitched-printed-3-piece-suit',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'party'],                 style: ['printed'] },
      { path: '/collections/unstitched-printed-shirt-trouser',
        subCategory: 'unstitched-2-piece',occasion: ['casual'],                          style: ['printed'] },
      { path: '/collections/unstitched-glam-printed-shirt-dupatta',
        subCategory: 'unstitched-2-piece',occasion: ['party', 'casual'],                 style: ['printed', 'trendy'] },
      // ── Co-Ords ──────────────────────────────────────────────────────
      { path: '/collections/co-ords-main',
        subCategory: '2-piece',           occasion: ['casual', 'office', 'party'],       style: ['trendy', 'minimal'] },
      { path: '/collections/embroidered-co-ords',
        subCategory: '2-piece',           occasion: ['party', 'eid'],                    style: ['embroidered', 'elegant'] },
      // ── Western ──────────────────────────────────────────────────────
      { path: '/collections/western',
        subCategory: 'western',           occasion: ['casual', 'party'],                 style: ['western', 'trendy'] },
      // ── Eid & Sale ───────────────────────────────────────────────────
      { path: '/collections/eid-collections',
        subCategory: 'festive',           occasion: ['eid', 'party', 'wedding'],         style: ['embroidered', 'elegant'] },
      { path: '/collections/new-on-sale',
        subCategory: 'other',             occasion: ['casual'],                          style: ['minimal'] }
    ]
  },

  // ════════════════════════════════════════════════════════════════════════════
  // KHAADI — pk.khaadi.com  (Custom platform, NOT Shopify — JS-rendered)
  // Menu: READY TO WEAR (Essentials/Signature/Casuals) | FABRICS | EID COLLECTION
  // Note: HTML extraction used; Shopify strategies will always return 0.
  // ════════════════════════════════════════════════════════════════════════════
  {
    brand: 'Khaadi',
    baseUrl: 'https://pk.khaadi.com',
    adapter: 'KhaadiAdapter',
    category: 'clothing',
    collections: [
      // ── Ready to Wear — Essentials ───────────────────────────────────
      { path: '/ready-to-wear/essentials/2-piece/',
        subCategory: '2-piece',           occasion: ['casual', 'office'],                style: ['minimal', 'printed'] },
      { path: '/ready-to-wear/essentials/3-piece/',
        subCategory: '3-piece',           occasion: ['casual', 'party'],                 style: ['elegant', 'printed'] },
      { path: '/ready-to-wear/essentials/kurta/',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['minimal', 'printed'] },
      { path: '/ready-to-wear/essentials/pants/',
        subCategory: 'pants',             occasion: ['casual', 'office'],                style: ['minimal'] },
      { path: '/ready-to-wear/essentials/shalwar/',
        subCategory: 'shalwar',           occasion: ['casual'],                          style: ['traditional', 'minimal'] },
      { path: '/ready-to-wear/essentials/dupatta/',
        subCategory: 'dupatta',           occasion: ['casual', 'eid'],                   style: ['minimal', 'printed'] },
      { path: '/ready-to-wear/essentials/shawl/',
        subCategory: 'dupatta',           occasion: ['casual', 'winter'],                style: ['minimal'] },
      // ── Ready to Wear — Signature ────────────────────────────────────
      { path: '/ready-to-wear/signature/2-piece/',
        subCategory: '2-piece',           occasion: ['party', 'office', 'eid'],          style: ['embroidered', 'elegant'] },
      { path: '/ready-to-wear/signature/3-piece/',
        subCategory: '3-piece',           occasion: ['party', 'eid', 'wedding'],         style: ['embroidered', 'elegant'] },
      { path: '/ready-to-wear/signature/kurta/',
        subCategory: 'kurta',             occasion: ['party', 'office', 'eid'],          style: ['embroidered', 'elegant'] },
      { path: '/ready-to-wear/signature/pants/',
        subCategory: 'pants',             occasion: ['office', 'party'],                 style: ['elegant'] },
      { path: '/ready-to-wear/signature/shalwar/',
        subCategory: 'shalwar',           occasion: ['eid', 'party'],                    style: ['traditional', 'elegant'] },
      { path: '/ready-to-wear/signature/dupatta/',
        subCategory: 'dupatta',           occasion: ['eid', 'party'],                    style: ['embroidered', 'elegant'] },
      // ── Ready to Wear — Casuals ──────────────────────────────────────
      { path: '/ready-to-wear/casuals/shirt/',
        subCategory: 'kurta',             occasion: ['casual'],                          style: ['minimal', 'printed'] },
      { path: '/ready-to-wear/casuals/blouse/',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['minimal', 'western'] },
      { path: '/ready-to-wear/casuals/tunic/',
        subCategory: 'kurta',             occasion: ['casual'],                          style: ['minimal'] },
      { path: '/ready-to-wear/casuals/trousers/',
        subCategory: 'pants',             occasion: ['casual', 'office'],                style: ['minimal', 'western'] },
      // ── Fabrics / Unstitched ─────────────────────────────────────────
      { path: '/fabrics/essentials/2-piece/',
        subCategory: 'unstitched-2-piece',occasion: ['casual', 'office'],                style: ['printed', 'minimal'] },
      { path: '/fabrics/essentials/3-piece/',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'party'],                 style: ['printed', 'elegant'] },
      { path: '/fabrics/signature/2-piece/',
        subCategory: 'unstitched-2-piece',occasion: ['party', 'eid'],                    style: ['embroidered', 'elegant'] },
      { path: '/fabrics/signature/3-piece/',
        subCategory: 'unstitched-3-piece',occasion: ['party', 'eid', 'wedding'],         style: ['embroidered', 'elegant'] },
      // ── Eid Collection ───────────────────────────────────────────────
      { path: '/eid-collection/ready-to-wear/',
        subCategory: 'festive',           occasion: ['eid', 'party'],                    style: ['embroidered', 'elegant'] }
    ]
  },

  // ════════════════════════════════════════════════════════════════════════════
  // ALKARAM STUDIO — alkaramstudio.com  (Shopify)
  // Menu: READY TO STITCH (Basics/Essentials/Signature/Capsule/Luxe)
  //        SHOP BY COLLECTION (Summer Basics/Essentials/White on White/Jacquard/Meraki)
  //        READY TO WEAR (Basics/Essentials/Signature/Luxe/Fusion/Modest)
  //        SHOP BY PRODUCT (Shirt/Bottoms/Shirt & Trouser/Shirt & Dupatta/3-Piece)
  // ════════════════════════════════════════════════════════════════════════════
  {
    brand: 'Alkaram Studio',
    baseUrl: 'https://www.alkaramstudio.com',
    adapter: 'AlkaramAdapter',
    category: 'clothing',
    collections: [
      // ── Ready to Stitch (Unstitched) — by line ───────────────────────
      { path: '/collections/summer26',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'party', 'summer'],       style: ['printed', 'trendy'] },
      { path: '/collections/summer-signature-26',
        subCategory: 'unstitched-3-piece',occasion: ['party', 'eid'],                    style: ['embroidered', 'elegant'] },
      { path: '/collections/unstitched',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'office'],                style: ['printed'] },
      { path: '/collections/unstitched-embroidered',
        subCategory: 'festive',           occasion: ['party', 'eid', 'wedding'],         style: ['embroidered', 'elegant'] },
      { path: '/collections/unstitched-3-piece',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'party'],                 style: ['printed', 'elegant'] },
      { path: '/collections/unstitched-capsule',
        subCategory: 'festive',           occasion: ['eid', 'party'],                    style: ['embroidered', 'elegant'] },
      // ── Ready to Wear — by line ──────────────────────────────────────
      { path: '/collections/rtw-basics',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['minimal', 'printed'] },
      { path: '/collections/rtw-essentials',
        subCategory: '2-piece',           occasion: ['casual', 'office'],                style: ['minimal', 'printed'] },
      { path: '/collections/rtw-luxe',
        subCategory: 'festive',           occasion: ['party', 'eid', 'wedding'],         style: ['embroidered', 'elegant'] },
      // ── Shop by Product (RTW) ────────────────────────────────────────
      { path: '/collections/women-rtw-shirt',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['printed', 'minimal'] },
      { path: '/collections/women-rtw-bottoms',
        subCategory: 'pants',             occasion: ['casual', 'office'],                style: ['minimal'] },
      { path: '/collections/women-rtw-shirt-trouser',
        subCategory: '2-piece',           occasion: ['casual', 'office'],                style: ['printed', 'minimal'] },
      { path: '/collections/women-rtw-shirt-trouser-dupatta',
        subCategory: '3-piece',           occasion: ['party', 'eid', 'casual'],          style: ['printed', 'elegant'] },
      // ── Shop by Product (Unstitched) ─────────────────────────────────
      { path: '/collections/women-unstitched-shirt-dupatta',
        subCategory: 'unstitched-2-piece',occasion: ['casual', 'party'],                 style: ['printed'] },
      // ── Eid & Sale ───────────────────────────────────────────────────
      { path: '/collections/eid-edit-26',
        subCategory: 'festive',           occasion: ['eid', 'party', 'wedding'],         style: ['embroidered', 'elegant'] },
      { path: '/collections/sale',
        subCategory: 'other',             occasion: ['casual'],                          style: ['minimal'] }
    ]
  },

  // ════════════════════════════════════════════════════════════════════════════
  // GUL AHMED (Ideas) — gulahmedshop.com  (Shopify)
  // Menu: UNSTITCHED (Lawn 2026 / Festive / Capsule)
  //        READY TO WEAR (Pret Signature / Pret Essential / Everyday Edit / 9to5 / Unstitched To Stitched)
  // All paths use /collections/ prefix — required for Shopify JSON Strategy 1.
  // ════════════════════════════════════════════════════════════════════════════
  {
    brand: 'Gul Ahmed',
    baseUrl: 'https://www.gulahmedshop.com',
    adapter: 'GulAhmedAdapter',
    category: 'clothing',
    collections: [
      // ── Unstitched — Lawn 2026 ───────────────────────────────────────
      { path: '/collections/unstitched-fabric-lawn-collection',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'summer'],                style: ['printed'] },
      { path: '/collections/embroidered-lawn-2026',
        subCategory: 'unstitched-3-piece',occasion: ['casual', 'party'],                 style: ['embroidered', 'printed'] },
      { path: '/collections/unstitched-2-piece',
        subCategory: 'unstitched-2-piece',occasion: ['casual', 'office'],                style: ['printed', 'minimal'] },
      { path: '/collections/unstitched-3-piece',
        subCategory: 'unstitched-3-piece',occasion: ['party', 'casual'],                 style: ['printed', 'elegant'] },
      // ── Unstitched — Festive ─────────────────────────────────────────
      { path: '/collections/unstitched-fabric-festive-collections',
        subCategory: 'unstitched-3-piece',occasion: ['eid', 'wedding', 'party'],         style: ['embroidered', 'elegant'] },
      { path: '/collections/festive-collection-2026',
        subCategory: 'festive',           occasion: ['eid', 'wedding', 'party'],         style: ['embroidered', 'elegant'] },
      // ── Ready to Wear — Pret Signature ──────────────────────────────
      { path: '/collections/women-ideas-pret-signature',
        subCategory: '3-piece',           occasion: ['party', 'eid', 'wedding'],         style: ['embroidered', 'elegant'] },
      { path: '/collections/women-ideas-pret-signature-dupattas',
        subCategory: 'dupatta',           occasion: ['party', 'eid'],                    style: ['embroidered', 'elegant'] },
      // ── Ready to Wear — Pret Essential ──────────────────────────────
      { path: '/collections/women-ideas-pret-essential',
        subCategory: '2-piece',           occasion: ['casual', 'office', 'eid'],         style: ['minimal', 'printed'] },
      // ── Ready to Wear — 9 to 5 (Co-Ord Sets) ───────────────────────
      { path: '/collections/women-ideas-9-to-5',
        subCategory: '2-piece',           occasion: ['office', 'casual'],                style: ['minimal', 'western'] },
      // ── Ready to Wear — Everyday Edit ───────────────────────────────
      { path: '/collections/women-ideas-pret-everyday-edit',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['minimal', 'trendy'] },
      { path: '/collections/women-ideas-pret-everyday-edit-dupattas',
        subCategory: 'dupatta',           occasion: ['casual', 'office'],                style: ['minimal', 'printed'] },
      // ── General RTW & Formals ────────────────────────────────────────
      { path: '/collections/ideas-pret-ready-to-wear',
        subCategory: 'kurta',             occasion: ['casual', 'office'],                style: ['minimal', 'trendy'] },
      { path: '/collections/formal-wear',
        subCategory: 'festive',           occasion: ['wedding', 'eid', 'formal'],        style: ['embroidered', 'heavy'] },
      // ── Sale ─────────────────────────────────────────────────────────
      { path: '/collections/sale',
        subCategory: 'other',             occasion: ['casual'],                          style: ['minimal'] }
    ]
  }

];
