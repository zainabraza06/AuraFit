# AuraFit — AI-Powered Pakistani Fashion Platform

> A full-stack fashion discovery, outfit-recommendation, and virtual try-on platform for the Pakistani market. AuraFit scrapes real product data from 14 Pakistani brands across four catalogs (clothing, shoes, jewellery, watches), and uses an **agentic, self-healing recommendation engine** — multi-provider LLMs, cross-catalog semantic search, and honest fashion-styling logic — to answer natural-language requests like *"bottle green 2-piece embroidered dress under 5000"* with real, in-stock products and truthful match reasons. A **Personal Stylist** mode goes further: describe yourself (body shape, skin tone, height) and an occasion, and the AI blends global styling principles with Pakistani traditional standards into genuine advice — honestly flagging when the truly ideal garment isn't in the catalog, rather than silently substituting or biasing the advice toward whatever is in stock.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Database Models](#database-models)
- [Recommendation Engine — Agentic Relaxation Loop](#recommendation-engine--agentic-relaxation-loop)
- [Personal Stylist](#personal-stylist)
- [Search — Keyword + Semantic, Cross-Catalog](#search--keyword--semantic-cross-catalog)
- [Visual Search](#visual-search)
- [Product-Page AI Accessory Picks](#product-page-ai-accessory-picks)
- [Virtual Try-On](#virtual-try-on)
- [Self-Healing Data Pipeline](#self-healing-data-pipeline)
- [Scraper Pipeline](#scraper-pipeline)
- [Multi-Provider AI Fallback Chain](#multi-provider-ai-fallback-chain)
- [Color Theory Engine](#color-theory-engine)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Scripts Reference](#scripts-reference)
- [Testing](#testing)

---

## Overview

Pakistani fashion shoppers have no single intelligent platform that aggregates products across the country's top brands and gives **honest, complete-outfit** recommendations. AuraFit solves this with:

- **Four independently-scraped catalogs** — clothing (1,416 items / 9 brands), shoes (325 items / 5 brands), jewellery (564 items / 7 brands), watches (3 brands, schema-ready) — normalized into a rich, structured schema (exact color shade *and* canonical family, dress style, stitching, piece count, fabric, print, occasion).
- **An agentic recommendation loop**: an LLM sees real-time DB counts for every possible constraint relaxation and decides — round by round — whether to relax a filter, raise the budget, accept, or honestly report nothing was found. It never pads results to a fixed count.
- **Self-healing data**: when the engine touches a product whose scraped field (dress style, fabric, gender, shoe silhouette, missing occasion tag) doesn't match its own title/description, it re-derives the correct value and writes the fix back to MongoDB — the catalog gets cleaner through normal use, with no full re-scrape needed.
- **Cross-catalog search** — one query box (keyword or semantic) searches clothing + shoes + jewellery + watches together and ranks results by relevance, so "black heels" surfaces shoes and "gold jhumka" surfaces jewellery, automatically.
- **World-standard styling logic** for accessory pairing: color-theory contrast (bold dress → neutral shoe), occasion-appropriate silhouette, and jewellery weight (statement vs minimal) based on the occasion.
- **Free-first AI**: every AI capability (intent parsing, ranking, vision analysis, virtual try-on) has a multi-provider fallback chain that tries free/cheap providers before paid ones, and degrades gracefully — never crashes — when a provider is unconfigured or out of quota.

---

## Features

### 🧵 Multi-Catalog Product Data
- **Clothing** (1,416 items) — Beechtree, Limelight, Zellbury, Alkaram Studio, Gul Ahmed, Khaadi, Maria B, Sana Safinaz, Elan
- **Shoes** (325 items) — Stylo, ECS, Borjan, Hush Puppies, Ndure
- **Jewellery** (564 items) — Stylo, Limelight, Gul Ahmed, Alkaram, Beechtree, Maria B, J.
- **Watches** (schema-ready) — Stylo, Limelight, ECS
- Dual color storage on every item: `primaryExactColor` (scraped shade, e.g. `"maroon"`) *and* `primaryColor` (canonical family, e.g. `"Red"`) — lets the engine match a user's exact shade first, then fall back to the family.
- **3-strategy waterfall scraping**: Shopify JSON API → site-wide listing crawl → Cheerio HTML parsing, per brand.

### 🤖 Agentic "Style Me" Recommendations
- Natural-language intent parsing (color, occasion, dress style, neckline, print, stitching, piece count, fabric, season, budget, accessory type) via a multi-provider LLM chain.
- **Hard vs. soft constraints**: gender is always hard; budget is hard *only if the user mentions a price* (no price → no filter, nothing to relax); every other attribute — including neckline, a lower-priority signal since only ~12% of the catalog has it structured — is soft and only filtered if the user mentioned it.
- **Gender safety net**: the catalog is 100% women's inventory, and gender is a hard, never-relaxed filter, so a wrong "men"/"kids" guess from an ambiguous garment word (kurta/shalwar-kameez are unisex-named in Pakistani fashion) used to silently zero out results with no way to recover. A non-"women" gender guess is now only honored if the original message has real corroborating text (e.g. "for my husband") — otherwise it defaults to "women", which the catalog can always actually serve.
- **Agentic relaxation loop**: each round, the LLM sees the *actual* catalog count for every possible next relaxation (`"drop print → 12 results"`, `"drop occasion → 40 results"`, `"lift budget → 3 results, cheapest PKR 8,900"`) and picks the single best move — relax the least-important filter, raise the budget, accept, or stop. Capped at `RELAXABLE.length + 2` rounds (10) — high enough that a rich, multi-constraint query (color + occasion + dress style + neckline + stitching + pieces + fabric + season) can always fully relax down to a real match rather than silently exhausting its round budget at zero results.
- **Never pads results** — accepts the tightest constraint level with *any* matches (even 1); only relaxes further when a level returns zero.
- **Honest match reasons**: a deterministic fact-checker (`describeMatch`) cross-checks every AI-generated reason against the product's actual fields (color, pieces, stitching, dress style, print, occasion, budget) and overrides it with an honest "Matches X, Y; but Z" sentence whenever the AI reason would misstate anything.
- **World-standard styling protocol** baked into the ranking prompt: heavy embroidery/velvet/organza → weddings/festive; lawn/cotton → summer/casual; seasonal fabric penalties; classic bridal palettes (maroon, bottle green, royal blue, gold); complete outfits ranked above single pieces.
- Per-result paired **shoe + jewellery**, chosen by color-contrast + occasion + silhouette scoring, each with its own honest reason.

### 👤 Personal Stylist
- Describe yourself (body shape, skin tone, height, whatever you choose to share) and an occasion in plain language — the AI blends **global styling principles** (color theory by skin undertone, silhouettes that flatter different body shapes, proportion balancing, neckline choices) with **Pakistani traditional standards** (occasion-appropriate garments, modesty norms, seasonal fabric, traditional occasion colors) into genuine, specific advice.
- **Catalog-agnostic ground truth**: the styling advice itself always reflects real fashion standards regardless of what the catalog stocks — e.g. correctly recommending a saree/maxi/gown for a farewell party or a corporate annual dinner rather than defaulting to shalwar-kameez just because that's the catalog's deepest category, or over-recommending lehenga for non-bridal formal events.
- **Honest catalog-availability disclosure**: only the *search* is pivoted to what the catalog can actually serve (e.g. a maxi-dress ideal maps to the closest available `western` search) — the advice text says so explicitly (`idealStyleNotAvailable`) instead of silently substituting.
- One click ("Show Recommendations") runs the generated search prompt through the same agentic outfit engine described above.

### 🔍 Cross-Catalog Search
- **Keyword search** (`/api/search`) — MongoDB `$text` + regex fallback, unioned and ranked across all four catalogs in one request.
- **Semantic search** (`/api/search/semantic`) — HuggingFace `all-MiniLM-L6-v2` sentence embeddings + a hybrid facet-alignment score (occasion/color/garment/keyword overlap), merged across all four catalogs by score. A query like *"black heels for a party"* correctly surfaces shoes; *"elegant embroidered formal wear"* surfaces clothing.
- Both auto-relax their similarity floor and report it honestly when nothing scores above threshold, rather than silently returning irrelevant items.

### 📸 Visual Search
- Upload a photo (of an outfit, shoes, or jewellery) — a vision-capable LLM (Mistral Pixtral, with Gemini as fallback) analyzes category / color / style / occasion / keywords.
- **Single-catalog scoping**: the photo shows exactly one item, so matches are restricted to that item's own catalog (`classifyCatalog()`) — a saree photo can no longer surface jewellery or shoes just because they scored competitively on color/occasion embedding.
- **Deliberately de-biased prompt**: explicit structural criteria distinguish visually-similar categories the vision model commonly confuses (e.g. saree's diagonal pallu drape vs. lehenga's separate stitched skirt + choli), and color-analysis guidance prevents pale/pastel shades (mint, sage, baby pink) from defaulting to "off-white" just because the example text anchored toward that phrase.
- **Same agentic honesty for clothing photos**: instead of a plain similarity threshold, a clothing photo's derived intent (dress style/color/occasion) runs through the identical progressive-relaxation engine used by text search, so a photo of a rare style (e.g. saree — only a couple in stock) gets an honest "no exact match, here's what we relaxed" instead of silently substituting or returning nothing.
- **Human-in-the-loop refinement**: after seeing results, free-text feedback like *"prioritize saree, color can change"* (`POST /api/search/visual/refine`) re-runs the same agentic engine with that instruction folded directly into what the relaxation planner reads — no re-upload needed.
- Regex fallback (checking both canonical color family *and* exact shade) when no embedding provider is configured.

### 🧥👠 Product-Page AI Accessory Picks
- "Complete the Look" (shoes + complementary clothing) on every product page uses the same footwear-matching logic as the outfit builder (`accessoryMatcher.js`) — including a **silhouette-mismatch guard**: eastern traditional wear (shalwar-kameez, kurta, lehenga, saree, abaya) is never paired with Western athletic shoes (sneakers/trainers/joggers) regardless of how "casual" the occasion is, a real global + Pakistani pairing standard the old occasion-only heuristic missed.
- **Agentic widen-and-retry loop**: the heuristically pre-filtered candidate pool (with full product descriptions, not just structured fields) is handed to an LLM that picks the best matches and explains each with a genuine, specific reason. If it judges the pool itself insufficient, the pool automatically widens and it's asked again — up to 3 rounds — instead of ever settling for a too-narrow first batch.

### 👗 Virtual Try-On
- Puts a product's image onto the user's saved profile picture using IDM-VTON.
- **Free-first, two-provider fallback**: tries the free Hugging Face Space (`yisol/IDM-VTON`, shared ZeroGPU hardware — no billing required) first; Replicate (paid, fast, ~30–90s) is an opportunistic fallback used automatically if it's configured with credit.
- **Photo validation + auto-extension**: a vision check rejects unusable photos (no person, face not visible, more than a minor crop missing) upfront rather than generating a broken result; a nearly-full-length photo missing only feet/ankles is automatically extended (outpainted) instead of rejected.
- "Try On Yourself" button on every clothing product card (not shown for shoes/jewellery/watches, where virtual try-on has no meaning); prompts to log in / set a profile picture if either is missing.

### 🩹 Self-Healing Catalog
- Query-time re-derivation + DB write-back for: clothing `dressStyle`/`fabric`, shoe `gender`/`shoeType`/missing `casual` occasion tags, jewellery `jewelryType` and non-jewellery contamination (footwear/bags scraped into the jewellery collection from mixed-catalog source pages).
- Title is treated as the authoritative source for structural fields; description is noisy marketing prose except for specific structured sub-patterns (`"Fabric:"`, `"Color:"`, `"What You'll Get:"` with negation-awareness).

### 🖼️ Profile Pictures & Cloudinary
- Optional avatar at registration or anytime from `/account`; used as the "person" image for AI Virtual Try-On.
- Explicit-credential Cloudinary integration (parses `CLOUDINARY_URL` and passes credentials directly to the SDK, rather than relying on its own env auto-read, which is unreliable given this app's ES-module import order).

### 🛍️ Discovery, Favorites & Admin
- Filterable product browser, autocomplete suggestions, pagination.
- JWT auth (30-day tokens), personal favorites, saved outfit boards, digital wardrobe (Gemini/Mistral vision auto-tagging).
- Admin dashboard: live scraper status via Server-Sent Events, manual scrape trigger, per-brand scrape history, product stats, brand deletion, catalog lexical audit, system logs.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router), React, TypeScript |
| Styling | Vanilla CSS — custom Editorial Fashion design system |
| HTTP Client | Axios with JWT interceptors |
| Backend | Node.js, Express 4 (ES Modules) |
| Database | MongoDB via Mongoose 8 |
| Authentication | JWT (jsonwebtoken), bcryptjs |
| AI — Text (primary) | Mistral (`mistral-small-latest`) |
| AI — Text (fallback) | OpenRouter → Groq → Gemini |
| AI — Vision (primary) | Mistral Pixtral (`pixtral-12b-2409`) |
| AI — Vision (fallback) | Google Gemini |
| Vector Embeddings | HuggingFace `sentence-transformers/all-MiniLM-L6-v2` |
| Virtual Try-On (paid) | Replicate `IDM-VTON` |
| Virtual Try-On (free) | Hugging Face Space `yisol/IDM-VTON` via `@gradio/client` |
| Image Hosting | Cloudinary |
| Web Scraping | Axios, Cheerio |
| Scheduling | node-cron |
| Security | Helmet, CORS, express-rate-limit |
| Testing | Node's built-in `node --test` + Supertest |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Next.js Frontend (App Router)                     │
│  Home("Style Me") · Discover · Search · Visual Search · Product · Account │
│  Try-On button (every ProductCard) · Wardrobe · Boards · Favorites · Admin│
└───────────────────────────────┬────────────────────────────────────────┘
                                 │ Axios (JWT Bearer)
┌───────────────────────────────▼────────────────────────────────────────┐
│                          Express API Server                              │
│   Helmet → CORS → rate limit → routes (thin) → controllers → services    │
│                                                                          │
│  /api/auth  /api/products  /api/recommendations  /api/search             │
│  /api/search/semantic  /api/search/visual  /api/tryon  /api/wardrobe     │
│  /api/favorites  /api/outfits  /api/admin  /api/support                  │
└───┬───────────────┬───────────────┬───────────────┬─────────────────────┘
    │               │               │               │
┌───▼─────────┐ ┌───▼──────────┐ ┌──▼────────────┐ ┌▼────────────────────┐
│Recommendation│ │Cross-Catalog │ │  Vision /     │ │   Scraper Pipeline  │
│   Engine     │ │   Search     │ │  Try-On       │ │  14 Brand Adapters  │
│ ──────────── │ │ ──────────── │ │ ────────────  │ │  4 Verticals        │
│ Agentic      │ │ Keyword      │ │ Mistral       │ │  (clothing/shoes/   │
│ relaxation   │ │ (Mongo text) │ │ Pixtral →     │ │   jewelry/watches)  │
│ loop         │ │ Semantic     │ │ Gemini vision │ │  3-strategy waterfall│
│ Self-healing │ │ (embeddings) │ │ free HF Space │ │  node-cron scheduler │
│ Color theory │ │ merged/      │ │ → Replicate   │ └──────────┬───────────┘
│ pairing      │ │ ranked       │ │ try-on        │            │
└──────┬───────┘ └──────┬───────┘ └──────┬────────┘            │
       │                │                │                      │
┌──────▼────────────────▼────────────────▼──────────────────────▼───────┐
│                              MongoDB                                    │
│  ClothingProduct · ShoeProduct · JewelryProduct · WatchProduct          │
│  User · Favorite · Outfit · WardrobeItem · ScraperLog · SystemLog       │
└──────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────┐
│                  Multi-Provider AI Fallback (per capability)             │
│  Text:   Mistral → OpenRouter → Groq → Gemini                            │
│  Vision: Mistral Pixtral → Gemini                                        │
│  Embed:  HuggingFace all-MiniLM-L6-v2                                    │
│  Try-On: Replicate (paid) → Hugging Face Space (free)                    │
│  Images: Cloudinary                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Request flow — "Style Me" (agentic relaxation)

```
User: "bottle green 2pc embroidered dress under 5000"
   │
   ▼
Intent parsing (Mistral → fallback chain)
   │  color=bottle green, pieces=2, print=embroidered, budget=5000
   ▼
┌─────────────── Agentic Relaxation Loop (max 10 rounds) ──────────────┐
│ Round N: fetch pool at current constraint level, self-heal in-place  │
│   ├─ pool.length ≥ 1 → ACCEPT, show honestly what's found            │
│   └─ pool.length = 0 → probe every possible next relaxation's count, │
│      probe budget-lift count + cheapest price, ask the LLM:          │
│      "relax X" | "raise_budget" | "accept" | "stop"                  │
└────────────────────────────────────────────────────────────────────┘
   ▼
AI ranking (top candidates → ranked list + per-item reason)
   │  reason fact-checked against real fields; dishonest AI reasons
   │  overridden by describeMatch()
   ▼
Per-result shoe + jewellery pairing (color contrast + occasion + silhouette)
   ▼
Response: { results[], matchQuality: { tier, message }, relaxationMessage,
            refinementTrace: [ { action, constraint, note } ] }
```

---

## Project Structure

```
Fashion/
├── backend/
│   ├── config/db.js                       # MongoDB connection
│   ├── middleware/auth.js                 # JWT verification + admin guard
│   ├── models/
│   │   ├── ClothingProduct.js  ShoeProduct.js  JewelryProduct.js  WatchProduct.js
│   │   ├── User.js  Favorite.js  Outfit.js  WardrobeItem.js
│   │   └── ScraperLog.js  SystemLog.js
│   ├── controllers/
│   │   ├── recommendationsController.js   # Style Me + product-page recs
│   │   ├── searchController.js            # cross-catalog keyword search
│   │   ├── vectorSearchController.js      # cross-catalog semantic search
│   │   ├── imageSearchController.js       # visual search (vision → catalog-scoped agentic/semantic) + refine
│   │   ├── tryonController.js             # free HF Space → Replicate fallback
│   │   ├── productsController.js  authController.js  favoritesController.js
│   │   ├── outfitsController.js  wardrobeController.js  adminController.js
│   ├── routes/                            # thin route → controller wiring
│   ├── services/
│   │   ├── recommendationEngine.js        # agentic loop + self-healing + pairing
│   │   ├── aiService.js                   # ranking, relaxation planner, personal-stylist advice, shoe/clothing AI reasoning
│   │   ├── llmClient.js                   # multi-provider text/vision fallback
│   │   ├── crossCatalogSearch.js          # shared embedding+facet search (text & visual)
│   │   ├── searchQueryIntel.js            # query → signals (color/occasion/garment)
│   │   ├── accessoryMatcher.js            # shoe/jewellery/watch scoring
│   │   ├── colorTheory.js  colorNormalize.js
│   │   ├── embeddingText.js               # per-catalog embedding text builders
│   │   ├── cloudinary.js                  # explicit-credential image hosting
│   │   ├── productCompat.js               # legacy field aliasing
│   │   └── intentPrompt.js  intentAdapter.js  intentScoring.js
│   ├── jobs/scraperJob.js                 # node-cron weekly scheduler
│   ├── scripts/
│   │   ├── scrapers/
│   │   │   ├── index.js                   # clothing orchestrator
│   │   │   ├── runVertical.js             # shoes/jewelry/watches/all runner
│   │   │   ├── config/                    # per-vertical brand + collection config
│   │   │   ├── adapters/                  # 15 brand adapters (BaseAdapter + 14)
│   │   │   ├── extractors/                # shopifyExtractor.js, htmlExtractor.js
│   │   │   ├── parsers/                   # productParser.js, shoeParser.js, jewelryParser.js, watchParser.js
│   │   │   └── utils/                     # colorInference.js, logger.js, catalogQA.js
│   │   ├── embedAll.js  embedAccessories.js
│   │   ├── exportCatalog.js  auditCatalog.js  seedAdmin.js
│   ├── tests/                             # node --test suite (151 tests)
│   ├── app.js                             # Express app factory
│   └── server.js                          # entrypoint
│
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx                   # Home — "Style Me" hero + featured
        │   ├── discover/  search/  search/visual/  product/[id]/
        │   ├── favorites/  boards/  wardrobe/  try-on/
        │   ├── account/  login/  register/  admin/  categories/  chat/ (Personal Stylist full page)
        ├── components/
        │   ├── Navbar.tsx  ProductCard.tsx  TryOnButton.tsx (clothing only)
        │   ├── ChatWidget.tsx                # Personal Stylist chat (floating widget)
        │   ├── RecommendationResult.tsx
        ├── context/AuthContext.tsx
        └── lib/api.ts                     # typed Axios client
```

---

## Database Models

### ClothingProduct / ShoeProduct / JewelryProduct / WatchProduct
Four separate collections (not a single polymorphic `Product`), each with catalog-specific taxonomy but a shared shape for cross-catalog search:

| Field | Type | Notes |
|-------|------|-------|
| `name`, `brand`, `price`, `compareAtPrice`, `currency` | — | |
| `primaryColor` / `colors` | String / [String] | **Canonical family** (Red, Blue, Gold, Multicolor, …) |
| `primaryExactColor` / `exactColors` | String / [String] | **Exact scraped shade** (maroon, bottle green, …) |
| `occasion`, `style`, `tags`, `trendTags` | [String] | |
| `gender` | String | `women` \| `men` \| `kids` \| `unisex` — women-only catalog filter applied at scrape time |
| `images`, `imageUrl`, `description`, `productUrl` (unique) | — | |
| `embedding`, `embeddingModel` | [Number], String | HuggingFace sentence embedding for semantic search |
| `inStock`, `scrapedAt`, `updatedAt` | — | |

**ClothingProduct-specific:** `dressStyle` (saree/lehenga/frock/maxi/shalwar-kameez/kurta/co-ord/palazzo/western/…), `stitchedType`, `pieceType`, `pieceDetails.{totalCount,includes}`, `fabric`, `pattern`, `season`.

**ShoeProduct-specific:** `shoeType` (khussa/heel/pump/wedge/sandal/sneaker/boot/…), `subCategory`, `closure`, `heelHeight`, `sizes`.

**JewelryProduct-specific:** `jewelryType` (earring/ring/necklace/bangle/jhumka/maang-tikka/bridal-set/…), `jewelryCategory` (ear/neck/wrist/hand/head), `metalFinish`, `stoneWork`.

**WatchProduct-specific:** `watchType`, `dialShape`, `caseMaterial`, `strapType`, `movement`.

### User
`name`, `email` (unique), `password` (bcrypt), `role` (`user`\|`admin`), `profilePicture` (Cloudinary URL — used as the Try-On "person" image), `preferences.{occasions,styles,favoriteColors,budget}`, `favoriteProducts[]`.

### Other collections
`Favorite` (user↔product join), `Outfit` (saved AI combinations), `WardrobeItem` (user-uploaded, vision-tagged), `ScraperLog` (per-run audit trail), `SystemLog` (error/event log surfaced in the admin dashboard).

---

## Recommendation Engine — Agentic Relaxation Loop

Replaces static weighted scoring with a live, LLM-guided negotiation between what the user asked for and what the catalog actually has.

1. **Intent parsing** — LLM extracts every field the user specified (nothing is assumed for unspecified fields), including `neckline` (round/v-neck/boat-neck/collar/keyhole/halter/square/off-shoulder) when explicitly named.
2. **Constraint classification** — gender is always hard (with a text-corroboration safety net against ambiguous garment-word misclassification — see Features above); budget is hard only if mentioned; everything else, including neckline, is soft.
3. **Round loop** (`RELAXABLE.length + 2` = 10 rounds — sized to cover every relaxable constraint firing at once plus color's own two-step exact→family→none path, since a rich stylist-generated query can legitimately specify all of them simultaneously):
   - Fetch the candidate pool at the current constraint level; self-heal any drifted fields in-place and in the DB.
   - If **any** results exist, stop and show them — never relax further just to pad the count, and never inflate a small result set to a fixed size.
   - If zero results, probe the *actual* DB count for every possible next relaxation (drop occasion? drop print? drop neckline? drop exact color → color family? lift the budget ceiling — and what's the cheapest item if we do?), and ask the LLM to pick one action: `relax <constraint>`, `raise_budget`, `accept`, or `stop`.
4. **Ranking** — candidates are sent to the LLM with full descriptions and a world-standard-fashion-protocol system prompt (occasion/formality cues, seasonal fabric fit, Pakistani bridal color palettes, garment completeness).
5. **Honesty pass** — `describeMatch()` independently recomputes matched/missed attributes from the product's real fields; if the AI's reason would misstate anything (including occasion, which the AI often glossed over), it's replaced with a fact-checked sentence.
6. **Accessory pairing** — one shoe + a jewellery set per result, scored on color contrast (bold dress → neutral shoe gets a bonus), occasion overlap, and silhouette-formality fit; heavy jewellery for wedding/bridal/mehndi, minimal for office/casual.

The full decision trace is returned as `refinementTrace` so the frontend can show *why* results were relaxed, not just that they were. This exact loop (`agenticRelax`, exported from `recommendationEngine.js`) is reused verbatim by visual search for clothing photos and by the human-in-the-loop refinement endpoint — see below.

---

## Personal Stylist

```
"I have a slim figure, wheatish skin tone, 5'3", going to my annual dinner"
   │
   ▼
generatePersonalStyleAdvice() — two-step reasoning, explicit in the prompt:
   │
   │  STEP 1 — What's genuinely IDEAL here, purely by global + Pakistani
   │  traditional styling logic, completely ignoring catalog stock? Known
   │  occasion norms are named explicitly so the LLM doesn't default to
   │  shalwar-kameez as a "safe" answer: university farewells → saree/maxi/
   │  Western gown; annual dinner galas → saree/Western gown, NOT bridal-
   │  style lehenga; red carpet → Western gown; garden parties → maxi/flowy
   │  Western.
   │
   │  STEP 2 — SEPARATELY, map Step 1's ideal to what's actually searchable
   │  (kurta, shalwar-kameez, western, lehenga, co-ord, abaya, saree — the
   │  catalog's only real-inventory styles). If Step 1's ideal isn't stocked,
   │  say so honestly (idealStyleNotAvailable) — this constraint affects ONLY
   │  the search mapping, never Step 1's advice text.
   ▼
{ advice, searchPrompt, dressStyle, occasion, idealStyleNotAvailable }
   │  searchPrompt is defensively sanitized: unresolved "X or Y" alternatives
   │  collapsed to one decisive choice, regional qualifiers (sharara-style,
   │  anarkali-style) stripped, and any leaked catalog-unavailable word
   │  (maxi/gown/frock/...) swapped for the real pivoted dressStyle.
   ▼
"Show Recommendations" → searchPrompt runs through the same agentic outfit engine above
```

---

## Search — Keyword + Semantic, Cross-Catalog

Both search endpoints run against **all four catalogs simultaneously** and merge results by relevance, rather than being scoped to one collection:

| | Keyword (`/api/search`) | Semantic (`/api/search/semantic`) |
|---|---|---|
| Engine | MongoDB `$text` index, regex fallback for partial words | HuggingFace `all-MiniLM-L6-v2` cosine similarity + facet-alignment hybrid score |
| Cross-catalog | ✅ unions clothing/shoes/jewelry/watches, sorted by text score | ✅ same, sorted by hybrid score |
| Graceful degradation | Falls back to regex when `$text` finds nothing | Falls back to keyword search if `HUGGING_FACE_API_KEY` is unset or the request errors |
| Honesty | Reports the true merged total across catalogs | Reports `relaxedFloor: true` when nothing passed the similarity threshold and the nearest matches are shown instead |

Restrict either endpoint to one catalog with `?catalog=shoes` (or `clothing`/`jewelry`/`watches`).

---

## Visual Search

```
Upload photo
   │
   ▼
Vision analysis (Mistral Pixtral → Gemini fallback)
   │  { category, color, style, occasion, keywords[] }
   │  (defensively coerced to plain strings — vision models sometimes
   │   return nested objects instead of the requested plain text;
   │   prompt gives explicit structural tells for commonly-confused
   │   categories, e.g. saree's diagonal pallu vs. lehenga's stitched
   │   skirt+choli, and warns against defaulting pale/pastel shades
   │   to "off-white")
   ▼
classifyCatalog() — the photo shows ONE item, so restrict matches to
   its own catalog (clothing / shoes / jewelry / watches)
   ▼
┌─── clothing photo ──────────────┐   ┌─── shoes/jewelry/watches photo ──┐
│ Build an intent (dressStyle/    │   │ Same cross-catalog hybrid        │
│ color/occasion) from the photo  │   │ embedding search used by text    │
│ analysis, run it through the    │   │ search, scoped to that catalog   │
│ SAME agenticRelax loop as text  │   └───────────────────────────────────┘
│ search — honest "relaxed X"     │
│ disclosure instead of a bare    │
│ similarity threshold            │
└──────────────────────────────────┘
   ▼
Ranked matches + intent echoed back in the response
   ▼
Optional: POST /api/search/visual/refine { intent, feedback }
   "prioritize saree, color can change" → re-runs agenticRelax with the
   feedback folded into what the relaxation planner reads — no re-upload
```

A photo of shoes correctly returns only shoes; a photo of jewellery correctly returns only jewellery — `classifyCatalog()` restricts the search before ranking even runs, rather than letting a cross-catalog embedding score let unrelated accessories leak into "top matches" for a clothing photo.

---

## Product-Page AI Accessory Picks

```
Product page → "Complete the Look"
   │
   ▼
Deterministic pre-filter: footwearFashionScore() / scoreProduct()
   (color harmony + contrast + occasion + silhouette-appropriateness —
    eastern wear silhouette-guard prevents sneakers/joggers from ever
    scoring competitively against khussa/sandals for shalwar-kameez/
    kurta/lehenga/saree/abaya, regardless of "casual" occasion)
   ▼
┌────────────── Agentic widen-and-retry loop (max 3 rounds) ───────────────┐
│ Send the candidate pool WITH FULL description text (not just            │
│ structured fields) to rankShoesWithAI() / rankComplementaryClothingWithAI()│
│   ├─ sufficientMatch: true  → done, use these picks + genuine reasons   │
│   └─ sufficientMatch: false → widen the pool (draws from more of the    │
│      catalog) and ask again, instead of settling for a too-narrow batch │
└────────────────────────────────────────────────────────────────────────┘
   ▼
{ shoes: [{ product, scores, reason }], complementaryClothing: [...],
  shoesNote, complementaryNote }  — note is surfaced only when the AI
  genuinely couldn't find a good match, never silently
```

Shoe and clothing loops run concurrently (`Promise.all`) since they're independent. Falls back to the deterministic heuristic order (no AI reason) if every provider is unavailable.

---

## Virtual Try-On

```
"Try On Yourself" (clothing ProductCard only — not shown for shoes/
jewellery/watches)  or  /try-on (manual upload)
   │
   ▼
Not logged in? → prompt to log in
No profile picture? → prompt to set one (Cloudinary)
   │
   ▼
Vision-based photo validation (Mistral Pixtral → Gemini fallback)
   │  reject: no person visible / face covered or turned away /
   │          more than a minor crop missing (e.g. waist-up only)
   │  nearly full-length, only feet/ankles cut off →
   │      auto-extend (outpaint) the photo instead of rejecting it
   ▼
POST /api/tryon { personUrl, clothingUrl, description }
   │
   ├─► Try the free Hugging Face Space (yisol/IDM-VTON via @gradio/client)
   │      shared "ZeroGPU" hardware — no billing required, primary path
   │      └─ busy/queued/failed → fall through
   │
   └─► Try Replicate (yisol/idm-vton) — paid, ~30-90s, opportunistic
          fallback used automatically if configured with credit
   │
   ▼
{ success, resultUrl, provider, message }
```

Both providers run the *same* underlying IDM-VTON model — the only difference is who's paying for the GPU. The free Hugging Face Space is primary since it requires no billing; if Replicate credit is available it's used automatically as a fallback for when the free Space is busy.

---

## Self-Healing Data Pipeline

Rather than only fixing the scraper and waiting for a full re-scrape, several recommendation/search code paths re-derive drift-prone fields from each candidate's own title/description **at query time** and write the correction back to MongoDB via `bulkWrite`:

| Catalog | Field healed | Trigger |
|---|---|---|
| Clothing | `dressStyle` | Re-derived from title only (title-authoritative) — fixes cases where the scraper had picked up a style mentioned only in marketing prose (e.g. "pairs well with a lehenga") |
| Clothing | `fabric` | Re-derived from structured `"Fabric:"` label / `"<fabric> fabric"` prose patterns |
| Shoes | `gender`, `shoeType` | Title-derived; corrects collection-level metadata bleed |
| Shoes | Missing `casual` occasion tag | Additive-only fix — shoes named/typed as casual/athletic but missing the `casual` occasion tag (inherited a wrong collection-level tag like eid/wedding) get it backfilled, without removing any existing tags |
| Jewellery | `jewelryType`, non-jewellery contamination | Word-boundary-safe type detection; hard name-based rejection of footwear/bags/apparel that leaked in from a brand's mixed jewellery+shoes collection page |

The catalog gets measurably cleaner the more it's used — no cron job or full re-scrape required for these classes of drift.

---

## Scraper Pipeline

### Extraction strategy (waterfall, per brand)

```
Brand collection URL
    │
    ├─► Strategy 1: GET /products.json?limit=250&page=N     (Shopify JSON API)
    │       fastest, most structured — works for any Shopify storefront
    │
    ├─► Strategy 2: Site-wide product listing crawl
    │       fallback for non-standard Shopify setups
    │
    └─► Strategy 3: Cheerio HTML parsing
            deepest fallback — parses product cards from raw HTML
```

### Normalization highlights (`productParser.js` / `shoeParser.js` / `jewelryParser.js`)
- **Title-authoritative** for structural fields (piece count, stitching, dress style, gender); description only trusted for specific structured sub-patterns.
- Composition parsing honors negation ("Shirt + Dupatta (Pants Not Included)") and "Paired With …" additions.
- Fabric detection prioritizes an explicit `"Fabric:"` label, then `"<fabric> fabric"` prose, then earliest-position match in title/description (so a base fabric wins over an embellishment thread mention).
- Gender resolution is name-first, then clean (non-coded) tags, then description as a last-resort signal, with word-boundary-safe regexes (fixes the classic "'women' contains 'men'" substring bug) and `unisex` detection.
- Women-only catalog filter applied post-validation in `BaseAdapter.js` for clothing, shoes, and jewelry verticals.

### Coverage by vertical

| Vertical | Brands | Items | Run |
|---|---|---|---|
| Clothing | Beechtree, Limelight, Zellbury, Alkaram Studio, Gul Ahmed, Khaadi, Maria B, Sana Safinaz, Elan | 1,416 | `npm run scrape` |
| Shoes | Stylo, ECS, Borjan, Hush Puppies, Ndure | 325 | `npm run scrape:shoes` |
| Jewellery | Stylo, Limelight, Gul Ahmed, Alkaram, Beechtree, Maria B, J. | 564 | `npm run scrape:jewelry` |
| Watches | Stylo, Limelight, ECS | schema-ready | `npm run scrape:watches` |

Run everything with `npm run scrape:all-verticals`. `SCRAPER_DRY_RUN=true` parses without writing to the DB.

---

## Multi-Provider AI Fallback Chain

Every AI capability tries providers in order, records success/failure per provider (with a cooldown circuit breaker after repeated failures), and degrades to the next provider — never crashes the request:

| Capability | Order |
|---|---|
| Text (intent parsing, ranking, relaxation planning) | Mistral → OpenRouter → Groq → Gemini (multi-model chain) |
| Vision (photo analysis, wardrobe tagging) | Mistral Pixtral → Gemini |
| Embeddings (semantic/visual search) | HuggingFace `all-MiniLM-L6-v2` (no fallback — endpoints degrade to keyword search if unset) |
| Virtual try-on | Hugging Face Space (free) → Replicate (paid, opportunistic) |
| Image hosting | Cloudinary |

Mistral is throttled to ≥1.1s between calls to respect its free-tier rate limit.

---

## Color Theory Engine

A handcrafted color compatibility matrix (`colorTheory.js`) covering the canonical families: Black, White, Grey, Red, Pink, Purple, Blue, Green, Teal, Yellow, Orange, Gold, Beige, Brown, Multicolor.

- **Alias resolution** — Pakistani/Urdu color transliterations map to canonical families (`ferozi/firozi`→Teal, `jamuni/baingan`→Purple, `gulabi`→Pink, `mehroon/surkh/laal`→Red, `nila`→Blue, `narangi`→Orange, `zard/peela`→Yellow, `safed`→White, `dhani/mehendi/sabz`→Green).
- **Exact-shade-first matching** — "maroon" tries to match `exactColors` before falling back to the `Red` family.
- **Accessory pairing** uses contrast rules (bold dress + neutral shoe = bonus), occasion overlap, and silhouette-formality fit — see `accessoryMatcher.js`.

---

## API Reference

### Auth — `/api/auth`
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create account (optional `image` field for profile picture) |
| POST | `/login` | — | Returns JWT (30-day expiry) |
| GET | `/me` | JWT | Current user profile |
| PUT | `/change-password` | JWT | Change password |
| PUT | `/profile-picture` | JWT | Upload/replace avatar (Cloudinary) |

### Products — `/api/products`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Paginated clothing list with filters (`brand`, `color`, `occasion`, `style`, `minPrice`, `maxPrice`, `gender`, `sort`) |
| GET | `/featured` | 10 random featured items |
| GET | `/stats` | Totals, top brands, price range |
| GET | `/:id` | Single product — resolves across **all four catalogs**, not just clothing |

### Recommendations — `/api/recommendations`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/outfit` | Body `{ message, prioritiesHint? }` — the full agentic "Style Me" flow |
| POST | `/style-advice` | Body `{ message }` — Personal Stylist: describe yourself + occasion, get `{ advice, searchPrompt, dressStyle, occasion, idealStyleNotAvailable }` |
| GET | `/:productId` | Product-detail-page "Complete the Look" suggestions — `{ source, shoes, complementaryClothing, shoesNote, complementaryNote }`, each pick AI-reasoned via the agentic widen-and-retry loop |

**POST `/outfit` response shape:**
```json
{
  "intent": { "colorExact": "bottle green", "pieces": 2, "print": "embroidered", "maxBudget": 5000, "...": "..." },
  "results": [
    {
      "product": { "name": "...", "price": 3890, "primaryExactColor": "mint green", "...": "..." },
      "rank": 1,
      "matchReason": "Matches Green colour, 2-piece, stitched, embroidered work; but shalwar-kameez, not the exact style requested.",
      "shoe": { "product": { "...": "..." }, "reason": "Grey footwear balances the Green ensemble (color harmony + contrast)" },
      "jewelry": [ { "product": { "...": "..." }, "reason": "jhumka in silver complements Green for the occasion tone" } ]
    }
  ],
  "matchQuality": { "tier": "loose", "totalFound": 2, "message": "No exact match — relaxed occasion. Showing results that still match: ..." },
  "relaxationMessage": "...",
  "refinementTrace": [ { "action": "relax", "constraint": "occasion", "note": "..." } ]
}
```
**Match quality tiers:** `exact` → `close` (≥8) → `similar` (≥4) → `loose` (relaxed) → `over-budget` / `none` (honest empty state).

### Search — `/api/search` and `/api/search/semantic`
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/search` | Cross-catalog keyword search (`q`, `catalog?`, `color`, `occasion`, `minPrice`, `maxPrice`, `gender`, `page`, `limit`) |
| GET | `/api/search/suggestions` | Top autocomplete matches across catalogs |
| GET | `/api/search/semantic` | Cross-catalog embedding search (`q`, `catalog?`, `gender`, `limit`) |
| POST | `/api/search/embed-all` | Admin/maintenance — backfill embeddings for a catalog |
| POST | `/api/search/visual/image` | Visual search — multipart `image` field. Response includes `intent` (clothing photos only) for use with `/refine` |
| POST | `/api/search/visual/refine` | Body `{ intent, feedback }` — human-in-the-loop refinement (e.g. *"prioritize saree, color can change"*) using the `intent` echoed by `/image`, re-runs the same agentic relaxation engine |

### Try-On — `/api/tryon`
| Method | Endpoint | Description |
|---|---|---|
| POST | `/` | Multipart (`person`, `clothing` files) **or** JSON (`personUrl`, `clothingUrl`, `description`) — tries the free HF Space first, then Replicate as an opportunistic fallback if configured with credit |

### Favorites — `/api/favorites` (JWT required)
`GET /` · `POST /:productId` (toggle) · `GET /check/:productId` · `DELETE /:productId`

### Outfits / Wardrobe (JWT required)
`/api/outfits` — save/list/delete outfit boards. `/api/wardrobe` — upload + vision-tag a personal clothing item.

### Admin — `/api/admin` (JWT + admin role)
`GET /stats` · `GET /scraper/logs` · `GET /scraper/status` · `GET /scraper/stream` (SSE) · `POST /scraper/run` · `DELETE /products/brand/:brand` · `POST /catalog/lexical-audit` · `GET /system-logs` · `POST /system-logs/:id/resolve`

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `PORT` | No | Express port (default `5000`) |
| `FRONTEND_URL` | Yes | CORS allowed origin |
| `MISTRAL_API_KEY` | Recommended | Primary text + vision LLM (free tier, ~1 req/sec) |
| `MISTRAL_MODEL` | No | Default `mistral-small-latest` |
| `GEMINI_API_KEY` | No | Fallback text + vision LLM |
| `GROQ_API_KEY` | No | Fallback text LLM |
| `OPENROUTER_API_KEY` | No | Fallback text LLM |
| `HUGGING_FACE_API_KEY` | Recommended | Embeddings (semantic/visual search) + free try-on rate limits |
| `REPLICATE_API_KEY` | No | Paid, fast virtual try-on (falls back to free HF Space if unset/out of credit) |
| `CLOUDINARY_URL` | No | `cloudinary://<api_key>:<api_secret>@<cloud_name>` — profile picture uploads |
| `SCRAPER_DRY_RUN` | No | `true` = parse only, no DB writes |
| `SCRAPER_MAX_PER_BRAND` | No | Max products per brand |
| `SCRAPER_DELAY_MS` | No | Delay between scraper requests |
| `SCRAPER_RETRY_LIMIT` | No | Max retries per request |
| `SCRAPER_CRON_SCHEDULE` | No | Cron expression for the weekly auto-scrape |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Yes | Seed the admin account |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL |

---

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local or Atlas)
- Free API keys: [Mistral](https://console.mistral.ai) (text+vision), [HuggingFace](https://huggingface.co/settings/tokens) (embeddings), [Cloudinary](https://cloudinary.com) (images) — all have generous free tiers

### 1. Install
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment
```bash
cd backend
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, FRONTEND_URL, ADMIN_*, and the AI keys above
```
```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:5000/api" > .env.local
```

### 3. Run
```bash
cd backend && npm run dev     # http://localhost:5000
cd frontend && npm run dev    # http://localhost:3000
```

### 4. Seed admin + populate catalogs
```bash
cd backend
npm run seed:admin
npm run scrape                    # clothing
npm run scrape:all-verticals      # shoes + jewelry + watches
npm run embed:clothing            # backfill embeddings for semantic/visual search
npm run embed:accessories         # same, for shoes + jewelry
```

---

## Scripts Reference

| Script | Command | Description |
|---|---|---|
| Start (prod) | `npm start` | `node server.js` |
| Start (dev) | `npm run dev` | `nodemon server.js` |
| Scrape clothing | `npm run scrape` | Full scrape, writes to DB |
| Scrape (dry run) | `npm run scrape:dry` | Parse only, no DB writes |
| Scrape shoes | `npm run scrape:shoes` | |
| Scrape jewelry | `npm run scrape:jewelry` | |
| Scrape watches | `npm run scrape:watches` | |
| Scrape all verticals | `npm run scrape:all-verticals` | |
| Fresh scrape | `npm run scrape:fresh` | Clears DB, then full clothing scrape |
| Export catalog | `npm run export:catalog` | Dumps all catalogs to JSON/CSV for external audit |
| Audit catalog | `npm run audit:catalog` | Consistency checker (field vs. description mismatches) |
| Seed admin | `npm run seed:admin` | Create admin from `.env` |
| Embed clothing | `npm run embed:clothing` | Backfill HuggingFace embeddings for products missing one |
| Embed accessories | `npm run embed:accessories` | Same, for shoes + jewelry |
| Test | `npm test` | Runs the full `node --test` suite |

---

## Testing

```bash
cd backend && npm test
```

151 tests across 26 suites covering: scraper field-extraction correctness (piece count, stitching, dress style, fabric, gender, color inference), search-query intent signals, hybrid scoring math, and outfit-recommendation logic. Run with `node --test`; no separate test runner install required.

---

*Built for the Pakistani Fashion Community*
