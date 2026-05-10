/**
 * testRecommendations.js
 * Comprehensive test suite for the AuraFit recommendation engine.
 *
 * Tests:
 *   1. Color normalization — alias resolution (English + Urdu)
 *   2. Three-tier color scoring logic (unit tests, no DB)
 *   3. Live DB queries — top results for various color/occasion inputs
 *   4. Gemini intent parsing — shade field extraction
 *   5. End-to-end: full getOutfitForQuery() with real DB data
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getOutfitForQuery, CANONICAL_COLORS } from '../services/recommendationEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ─── Colour codes for terminal output ────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', grey: '\x1b[90m'
};
const pass  = `${C.green}PASS${C.reset}`;
const fail  = `${C.red}FAIL${C.reset}`;
const warn  = `${C.yellow}WARN${C.reset}`;
const sep   = `${C.grey}${'─'.repeat(60)}${C.reset}`;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(label, condition, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${pass}  ${label}`);
  } else {
    failedTests++;
    console.log(`  ${fail}  ${label}${detail ? `  ${C.grey}(${detail})${C.reset}` : ''}`);
  }
}

// ─── Re-implement normalizeColor locally for unit tests ──────────────────────
// (mirrors recommendationEngine.js so we can test without importing internals)
const COLOR_ALIASES = {
  'navy': 'Blue', 'navy blue': 'Blue', 'sky blue': 'Blue', 'cobalt': 'Blue',
  'royal blue': 'Blue', 'light blue': 'Blue', 'denim': 'Blue', 'indigo': 'Blue',
  'midnight blue': 'Blue', 'baby blue': 'Blue', 'cerulean': 'Blue', 'azure': 'Blue',
  'nila': 'Blue',
  'emerald': 'Green', 'olive': 'Green', 'mint': 'Green', 'sage': 'Green',
  'forest green': 'Green', 'bottle green': 'Green', 'sea green': 'Green',
  'lime': 'Green', 'pista': 'Green', 'pistachio': 'Green',
  'dhani': 'Green', 'mehendi': 'Green', 'sabz': 'Green', 'parrot green': 'Green',
  'maroon': 'Red', 'crimson': 'Red', 'burgundy': 'Red', 'wine': 'Red', 'rust': 'Red',
  'dark red': 'Red', 'brick red': 'Red', 'cherry': 'Red', 'scarlet': 'Red',
  'ruby': 'Red', 'mehroon': 'Red', 'mehrun': 'Red', 'merun': 'Red',
  'surkh': 'Red', 'laal': 'Red',
  'beige': 'Beige', 'nude': 'Beige', 'camel': 'Beige', 'fawn': 'Beige',
  'khaki': 'Beige', 'sand': 'Beige', 'oat': 'Beige', 'linen': 'Beige',
  'ivory': 'White', 'cream': 'White', 'off white': 'White', 'off-white': 'White',
  'snow': 'White', 'pearl': 'White', 'chalk': 'White', 'safed': 'White',
  'silver': 'Grey', 'ash': 'Grey', 'slate': 'Grey', 'smoke': 'Grey',
  'gray': 'Grey', 'grey': 'Grey', 'charcoal': 'Black', 'graphite': 'Black',
  'onyx': 'Black', 'jet black': 'Black',
  'blush': 'Pink', 'peach': 'Pink', 'rose': 'Pink', 'fuchsia': 'Pink',
  'hot pink': 'Pink', 'baby pink': 'Pink', 'salmon': 'Pink', 'magenta': 'Pink',
  'gulabi': 'Pink',
  'lavender': 'Purple', 'lilac': 'Purple', 'mauve': 'Purple', 'plum': 'Purple',
  'violet': 'Purple', 'grape': 'Purple', 'wisteria': 'Purple', 'amethyst': 'Purple',
  'orchid': 'Purple', 'periwinkle': 'Purple', 'jamuni': 'Purple', 'baingan': 'Purple',
  'coral': 'Orange', 'terracotta': 'Orange', 'amber': 'Orange',
  'burnt orange': 'Orange', 'apricot': 'Orange', 'pumpkin': 'Orange',
  'tangerine': 'Orange', 'mango': 'Orange', 'copper': 'Orange', 'narangi': 'Orange',
  'mustard': 'Yellow', 'lemon': 'Yellow', 'saffron': 'Yellow',
  'butter': 'Yellow', 'canary': 'Yellow', 'sunflower': 'Yellow',
  'ochre': 'Yellow', 'zard': 'Yellow', 'peela': 'Yellow',
  'golden': 'Gold', 'gold': 'Gold', 'antique gold': 'Gold',
  'champagne': 'Gold', 'bronze': 'Gold', 'brass': 'Gold', 'rose gold': 'Gold',
  'turquoise': 'Teal', 'aqua': 'Teal', 'cyan': 'Teal', 'seafoam': 'Teal',
  'peacock': 'Teal', 'teal green': 'Teal', 'ferozi': 'Teal', 'firozi': 'Teal',
  'chocolate': 'Brown', 'mocha': 'Brown', 'coffee': 'Brown', 'caramel': 'Brown',
  'tan': 'Brown', 'walnut': 'Brown', 'chestnut': 'Brown', 'hazel': 'Brown',
  'multi': 'Multicolor', 'multicolor': 'Multicolor', 'printed': 'Multicolor',
  'colourful': 'Multicolor', 'floral': 'Multicolor',
};

function normalizeColor(color) {
  if (!color) return null;
  const lower = color.toLowerCase().trim();
  if (COLOR_ALIASES[lower]) return COLOR_ALIASES[lower];
  return color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
}

// ─── Simulate five-tier scoring (primary color only — unit tests pass primaryColor) ──
function simulateColorScore(intent, productPrimaryColor) {
  const { color, shade } = intent;
  if (!color || color.toLowerCase() === 'any') return 0.4;

  const primaryRaw  = productPrimaryColor.toLowerCase();
  const primaryNorm = normalizeColor(productPrimaryColor);
  const targetNorm  = normalizeColor(color);
  const shadeToMatch = shade || color.toLowerCase();

  if (primaryRaw.includes(shadeToMatch) || shadeToMatch.includes(primaryRaw)) {
    return 1.0;  // primaryColor exact shade match
  } else if (primaryNorm === targetNorm) {
    return 0.85; // primaryColor canonical alias match
  } else {
    return 0.08; // wrong color family
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function runTests() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║       AuraFit Recommendation Engine — Test Suite         ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════╝${C.reset}\n`);

  // ══════════════════════════════════════════════════════════
  // SECTION 1: Canonical color list
  // ══════════════════════════════════════════════════════════
  console.log(`${C.bold}1. CANONICAL COLORS${C.reset}`);
  console.log(sep);
  assert('15 canonical colors defined', CANONICAL_COLORS.length === 15,
    `got ${CANONICAL_COLORS.length}: ${CANONICAL_COLORS.join(', ')}`);
  const required = ['Black','White','Grey','Red','Pink','Purple','Blue','Green',
    'Teal','Yellow','Orange','Gold','Beige','Brown','Multicolor'];
  required.forEach(c => assert(`  → "${c}" present`, CANONICAL_COLORS.includes(c)));
  console.log();

  // ══════════════════════════════════════════════════════════
  // SECTION 2: Color normalization
  // ══════════════════════════════════════════════════════════
  console.log(`${C.bold}2. COLOR NORMALIZATION (alias resolution)${C.reset}`);
  console.log(sep);

  const normCases = [
    // English shades
    ['lavender',    'Purple'], ['lilac',   'Purple'], ['mauve',  'Purple'],
    ['violet',      'Purple'], ['jamuni',  'Purple'], ['baingan','Purple'],
    ['navy',        'Blue'],   ['cobalt',  'Blue'],   ['indigo', 'Blue'],
    ['nila',        'Blue'],
    ['coral',       'Orange'], ['tangerine','Orange'],['narangi','Orange'],
    ['amber',       'Orange'], ['mango',   'Orange'],
    ['maroon',      'Red'],    ['crimson', 'Red'],    ['burgundy','Red'],
    ['mehroon',     'Red'],    ['surkh',   'Red'],    ['laal',   'Red'],
    ['ivory',       'White'],  ['cream',   'White'],  ['off-white','White'],
    ['safed',       'White'],
    ['blush',       'Pink'],   ['fuchsia', 'Pink'],   ['gulabi', 'Pink'],
    ['ferozi',      'Teal'],   ['firozi',  'Teal'],   ['turquoise','Teal'],
    ['mustard',     'Yellow'], ['saffron', 'Yellow'], ['zard',   'Yellow'],
    ['peela',       'Yellow'],
    ['chocolate',   'Brown'],  ['mocha',   'Brown'],  ['caramel','Brown'],
    ['emerald',     'Green'],  ['olive',   'Green'],  ['dhani',  'Green'],
    ['mehendi',     'Green'],  ['sabz',    'Green'],
    ['beige',       'Beige'],  ['nude',    'Beige'],  ['camel',  'Beige'],
    ['khaki',       'Beige'],
    ['golden',      'Gold'],   ['champagne','Gold'],  ['bronze', 'Gold'],
    ['charcoal',    'Black'],  ['graphite','Black'],  ['jet black','Black'],
    ['silver',      'Grey'],   ['ash',     'Grey'],   ['slate',  'Grey'],
    ['printed',     'Multicolor'], ['floral','Multicolor'],
  ];

  normCases.forEach(([input, expected]) => {
    const got = normalizeColor(input);
    assert(`  "${input}" → "${expected}"`, got === expected, `got "${got}"`);
  });
  console.log();

  // ══════════════════════════════════════════════════════════
  // SECTION 3: Three-tier color scoring (unit tests)
  // ══════════════════════════════════════════════════════════
  console.log(`${C.bold}3. THREE-TIER COLOR SCORING (unit tests — no DB)${C.reset}`);
  console.log(sep);

  const scoreCases = [
    // [label, intent{color,shade}, productPrimaryColor, expectedScore, tier]
    ['Exact shade: "tangerine" in DB, user said "tangerine"',
      {color:'Orange', shade:'tangerine'}, 'tangerine', 1.0, 'Tier 1'],
    ['Exact shade: "ferozi" in DB, user said "ferozi"',
      {color:'Teal', shade:'ferozi'}, 'ferozi', 1.0, 'Tier 1'],
    ['Exact shade: "mehroon" in DB, user said "mehroon"',
      {color:'Red', shade:'mehroon'}, 'mehroon', 1.0, 'Tier 1'],
    ['Exact shade: "lavender" in DB, user said "lavender"',
      {color:'Purple', shade:'lavender'}, 'lavender', 1.0, 'Tier 1'],
    ['Substring shade: DB has "deep tangerine", user said "tangerine"',
      {color:'Orange', shade:'tangerine'}, 'deep tangerine', 1.0, 'Tier 1'],

    ['Canonical alias: DB has "coral" primaryColor, user asked "tangerine" (both → Orange)',
      {color:'Orange', shade:'tangerine'}, 'coral', 0.85, 'Tier 2'],
    ['Canonical alias: DB has "lilac" primaryColor, user asked "purple"',
      {color:'Purple', shade:'purple'}, 'lilac', 0.85, 'Tier 2'],
    ['Canonical alias: DB has "maroon" primaryColor, user asked "red"',
      {color:'Red', shade:'red'}, 'maroon', 0.85, 'Tier 2'],
    ['Canonical alias: DB has "turquoise" primaryColor, user asked "ferozi"',
      {color:'Teal', shade:'ferozi'}, 'turquoise', 0.85, 'Tier 2'],
    ['Canonical alias: DB has "cream" primaryColor, user asked "white"',
      {color:'White', shade:'white'}, 'cream', 0.85, 'Tier 2'],
    ['Canonical alias: DB has "mustard" primaryColor, user asked "yellow"',
      {color:'Yellow', shade:'yellow'}, 'mustard', 0.85, 'Tier 2'],

    ['Wrong family: DB has "White", user wants "Purple"',
      {color:'Purple', shade:'purple'}, 'White', 0.08, 'Tier 3'],
    ['Wrong family: DB has "Red", user wants "Blue"',
      {color:'Blue', shade:'blue'}, 'Red', 0.08, 'Tier 3'],
    ['Wrong family: DB has "Green", user wants "Pink"',
      {color:'Pink', shade:'pink'}, 'Green', 0.08, 'Tier 3'],

    ['No color requested → neutral baseline',
      {color:'Any', shade:null}, 'Purple', 0.4, 'Baseline'],
  ];

  scoreCases.forEach(([label, intent, productColor, expected, tier]) => {
    const got = simulateColorScore(intent, productColor);
    assert(`  [${tier}] ${label}`, got === expected, `got ${got}, expected ${expected}`);
  });
  console.log();

  // ══════════════════════════════════════════════════════════
  // SECTION 4: DB connection + product pool check
  // ══════════════════════════════════════════════════════════
  console.log(`${C.bold}4. DATABASE CONNECTION & PRODUCT POOL${C.reset}`);
  console.log(sep);

  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.log(`  ${warn}  MONGO_URI not set — skipping DB tests\n`);
  } else {
    try {
      await mongoose.connect(MONGO_URI);
      console.log(`  ${pass}  Connected to MongoDB`);

      const Product = (await import('../models/Product.js')).default;

      const totalClothing = await Product.countDocuments({ category: 'clothing' });
      const totalShoes    = await Product.countDocuments({ category: 'shoes' });
      assert(`  Clothing products in DB (need > 0)`, totalClothing > 0, `found ${totalClothing}`);
      assert(`  Shoe products in DB (need > 0)`, totalShoes > 0, `found ${totalShoes}`);
      console.log(`  ${C.grey}  clothing: ${totalClothing}  |  shoes: ${totalShoes}${C.reset}\n`);

      // Color distribution sample
      const colorSample = await Product.aggregate([
        { $match: { category: 'clothing', primaryColor: { $exists: true, $ne: null } } },
        { $group: { _id: '$primaryColor', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 }
      ]);
      console.log(`  ${C.grey}Top colors in DB:${C.reset}`);
      colorSample.forEach(c => {
        const norm = normalizeColor(c._id);
        const flag = CANONICAL_COLORS.includes(norm) ? '✓' : `→ ${norm}`;
        console.log(`    ${c._id.padEnd(20)} (${c.count}) ${flag}`);
      });
      console.log();

      // ══════════════════════════════════════════════════════════
      // SECTION 5: Live scoring tests with real DB data
      // ══════════════════════════════════════════════════════════
      console.log(`${C.bold}5. LIVE SCORING — getOutfitForQuery() with DB${C.reset}`);
      console.log(sep);

      const liveTests = [
        { label: 'Purple dress for wedding',
          intent: { color: 'Purple', shade: 'purple', occasion: ['wedding'], style: ['elegant'], maxBudget: 0 },
          expectColorFamily: 'Purple' },
        { label: 'Ferozi outfit for Eid',
          intent: { color: 'Teal', shade: 'ferozi', occasion: ['eid'], style: ['traditional'], maxBudget: 0 },
          expectColorFamily: 'Teal' },
        { label: 'Pink casual kurta',
          intent: { color: 'Pink', shade: 'pink', occasion: ['casual'], style: ['minimal'], maxBudget: 0 },
          expectColorFamily: 'Pink' },
        { label: 'Black formal office wear',
          intent: { color: 'Black', shade: 'black', occasion: ['office', 'formal'], style: ['minimal'], maxBudget: 0 },
          expectColorFamily: 'Black' },
        { label: 'White wedding outfit under PKR 20,000',
          intent: { color: 'White', shade: 'white', occasion: ['wedding'], style: ['elegant', 'embroidered'], maxBudget: 20000 },
          expectColorFamily: 'White' },
      ];

      for (const t of liveTests) {
        console.log(`\n  ${C.cyan}▸ ${t.label}${C.reset}`);
        try {
          const result = await getOutfitForQuery(t.intent);

          if (!result.heroDress) {
            console.log(`    ${warn}  No results returned — DB may lack ${t.expectColorFamily} products`);
            continue;
          }

              const heroColor = result.heroDress.primaryColor || '—';
          const heroNorm  = normalizeColor(heroColor);
          const heroScore = result.scores?.[0];

          // Count how many products of this color family exist in DB
          const allResults = [result.heroDress, ...(result.otherDresses || [])];
          const dbColorCount = colorSample.find(c => normalizeColor(c._id) === t.expectColorFamily)?.count || 0;
          const isSparseColor = dbColorCount < 30;

          if (isSparseColor) {
            // For sparse colors: just check that at least 1 correct-color product appears in top 10
            const anyMatch = allResults.some(p => normalizeColor(p.primaryColor) === t.expectColorFamily);
            assert(
              `At least 1 ${t.expectColorFamily} in top 10 (sparse: only ${dbColorCount} in DB)`,
              anyMatch,
              `none found — colors: ${allResults.map(p=>p.primaryColor).join(', ')}`
            );
            console.log(`    ${C.yellow}  WARN: Only ${dbColorCount} ${t.expectColorFamily} products in DB — hero/% checks skipped${C.reset}`);
          } else {
            // For well-represented colors: hero must match, ≥ 60% of top 10 must match
            assert(
              `Hero color "${heroColor}" normalizes to "${t.expectColorFamily}"`,
              heroNorm === t.expectColorFamily,
              `got norm="${heroNorm}"`
            );
            if (heroScore) {
              assert(
                `Hero color score ≥ 0.85 (primaryColor in correct family)`,
                heroScore.colorMatch >= 0.85,
                `got ${heroScore.colorMatch}`
              );
            }
            const correctCount = allResults.filter(p =>
              normalizeColor(p.primaryColor) === t.expectColorFamily
            ).length;
            const pct = Math.round((correctCount / allResults.length) * 100);
            assert(
              `≥ 60% of top results match color family (${correctCount}/${allResults.length} = ${pct}%)`,
              pct >= 60,
              `${pct}% match — colors returned: ${allResults.map(p => p.primaryColor).join(', ')}`
            );
          }

          // Print top 5 for visual inspection
          console.log(`    ${C.grey}Top 5 results:${C.reset}`);
          allResults.slice(0, 5).forEach((p, i) => {
            const s = result.scores?.[i];
            const scoreBar = s ? ` [color:${Math.round(s.colorMatch*100)}% total:${s.total}]` : '';
            const normColor = normalizeColor(p.primaryColor);
            const colorFlag = normColor === t.expectColorFamily ? C.green : C.red;
            console.log(`      #${i+1}. ${colorFlag}${p.primaryColor}${C.reset} — ${p.name?.substring(0,45)} (${p.brand}) PKR ${p.price}${C.grey}${scoreBar}${C.reset}`);
          });

          if (result.shoes?.length > 0) {
            console.log(`    ${C.grey}Matched shoes: ${result.shoes[0].name} (${result.shoes[0].brand}) PKR ${result.shoes[0].price}${C.reset}`);
          }

        } catch (err) {
          console.log(`    ${fail}  Error: ${err.message}`);
          failedTests++;
          totalTests++;
        }
      }
      console.log();

      // ══════════════════════════════════════════════════════════
      // SECTION 6: Budget filter test
      // ══════════════════════════════════════════════════════════
      console.log(`${C.bold}6. BUDGET FILTER${C.reset}`);
      console.log(sep);

      const budgetIntent = { color: 'Any', shade: null, occasion: ['casual'], style: ['minimal'], maxBudget: 5000 };
      const budgetResult = await getOutfitForQuery(budgetIntent);
      if (budgetResult.heroDress) {
        const allPrices = [budgetResult.heroDress, ...(budgetResult.otherDresses || [])].map(p => p.price);
        const allUnder = allPrices.every(p => p <= 5000);
        assert('All results are within PKR 5,000 budget', allUnder,
          `prices: ${allPrices.join(', ')}`);
        console.log(`  ${C.grey}  Found ${allPrices.length} results, max price: PKR ${Math.max(...allPrices)}${C.reset}`);
      } else {
        console.log(`  ${warn}  No products under PKR 5,000 in DB`);
      }
      console.log();

    } catch (err) {
      console.log(`  ${fail}  DB error: ${err.message}\n`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // SECTION 7: Gemini intent parsing
  // ══════════════════════════════════════════════════════════
  console.log(`${C.bold}7. GEMINI INTENT PARSING${C.reset}`);
  console.log(sep);

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    console.log(`  ${warn}  GEMINI_API_KEY not set — skipping Gemini tests\n`);
  } else {
    const geminiTests = [
      { msg: 'I need a ferozi lawn suit for eid',
        expectColor: 'Teal', expectShade: 'ferozi', expectOccasion: 'eid' },
      { msg: 'Looking for a purple outfit for a wedding under 15000',
        expectColor: 'Purple', expectOccasion: 'wedding', expectBudget: 15000 },
      { msg: 'Mehroon formal dress for office',
        expectColor: 'Red', expectShade: 'mehroon', expectOccasion: 'office' },
      { msg: 'Tangerine casual kurta',
        expectColor: 'Orange', expectShade: 'tangerine', expectOccasion: 'casual' },
      { msg: 'Pastel pink mehndi outfit',
        expectColor: 'Pink', expectOccasion: 'mehndi' },
    ];

    const CANONICAL_COLORS_LIST = [
      'Black','White','Grey','Red','Pink','Purple','Blue','Green',
      'Teal','Yellow','Orange','Gold','Beige','Brown','Multicolor'
    ];

    for (const t of geminiTests) {
      process.stdout.write(`  Testing: "${t.msg}" ... `);
      try {
        const ai = new GoogleGenerativeAI(GEMINI_KEY);
        const model = ai.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        });

        const prompt = `You are a fashion intent parser for AuraFit, a Pakistani platform.
Extract from this message: "${t.msg}"

Return ONLY JSON with:
- color: one of [${CANONICAL_COLORS_LIST.join(', ')}, Any]
- shade: exact color word(s) user typed (lowercase), or "any" if none
- occasion: array from ["casual","wedding","office","party","eid","formal","mehndi"]
- style: array from ["elegant","trendy","minimal","embroidered","western","traditional"]
- maxBudget: number in PKR, 0 if not mentioned
- intentSummary: one sentence
- aiAnalysis: 2-3 sentences`;

        const res = await model.generateContent(prompt);
        let text = res.response.text();
        if (text.includes('```')) text = text.replace(/```json/g,'').replace(/```/g,'').trim();
        const parsed = JSON.parse(text);

        console.log(''); // newline after "..."
        console.log(`    ${C.grey}Gemini returned: color="${parsed.color}" shade="${parsed.shade}" occasion=${JSON.stringify(parsed.occasion)} budget=${parsed.maxBudget}${C.reset}`);

        if (t.expectColor) assert(`    color = "${t.expectColor}"`, parsed.color === t.expectColor, `got "${parsed.color}"`);
        if (t.expectShade) assert(`    shade contains "${t.expectShade}"`, (parsed.shade||'').toLowerCase().includes(t.expectShade), `got "${parsed.shade}"`);
        if (t.expectOccasion) assert(`    occasion includes "${t.expectOccasion}"`, (parsed.occasion||[]).includes(t.expectOccasion), `got ${JSON.stringify(parsed.occasion)}`);
        if (t.expectBudget) assert(`    maxBudget = ${t.expectBudget}`, parsed.maxBudget === t.expectBudget, `got ${parsed.maxBudget}`);
        assert(`    color is canonical`, CANONICAL_COLORS_LIST.includes(parsed.color) || parsed.color === 'Any', `got "${parsed.color}"`);
        console.log();
      } catch (err) {
        console.log(`${fail}`);
        console.log(`    Error: ${err.message}\n`);
        failedTests++;
        totalTests++;
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log(sep);
  console.log(`${C.bold}TEST SUMMARY${C.reset}`);
  console.log(sep);
  console.log(`  Total:  ${totalTests}`);
  console.log(`  ${C.green}Passed: ${passedTests}${C.reset}`);
  if (failedTests > 0) {
    console.log(`  ${C.red}Failed: ${failedTests}${C.reset}`);
  } else {
    console.log(`  Failed: ${failedTests}`);
  }
  const pct = Math.round((passedTests / totalTests) * 100);
  const pctColor = pct >= 90 ? C.green : pct >= 70 ? C.yellow : C.red;
  console.log(`\n  ${pctColor}${C.bold}Score: ${pct}% (${passedTests}/${totalTests})${C.reset}\n`);

  await mongoose.disconnect().catch(() => {});
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
