# AuraFit — Backend Documentation (Full Detail)

> Exhaustive reference for **every** file, route, controller, middleware, model,
> service, scraper, adapter, extractor, parser, utility, job, and script in
> `backend/`. Use this as the single source of truth when extending, debugging,
> or onboarding.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Directory Structure](#3-directory-structure)
4. [Environment Variables](#4-environment-variables)
5. [NPM Scripts](#5-npm-scripts)
6. [Entry Point — `server.js`](#6-entry-point--serverjs)
7. [Configuration — `config/`](#7-configuration--config)
8. [Middleware — `middleware/`](#8-middleware--middleware)
9. [Models — `models/`](#9-models--models)
10. [Routes & Controllers — `routes/`](#10-routes--controllers--routes)
11. [Services — `services/`](#11-services--services)
12. [Jobs — `jobs/`](#12-jobs--jobs)
13. [Scrapers — `scripts/scrapers/`](#13-scrapers--scriptsscrapers)
14. [Standalone Scripts — `scripts/`](#14-standalone-scripts--scripts)
15. [Cross-Cutting Concerns](#15-cross-cutting-concerns)
16. [End-to-End Data Flows](#16-end-to-end-data-flows)
17. [API Quick-Reference Table](#17-api-quick-reference-table)

---

## 1. Architecture Overview

AuraFit's backend is a **modular monolithic Node.js + Express API** powering an
AI fashion stylist for the Pakistani market. It sits between three things:

- **MongoDB Atlas/local** — stores users, scraped products, favorites, outfits,
  wardrobe items, and scraper run logs.
- **Google Gemini (Generative AI)** — used for chat-based intent parsing,
  "Master Stylist" hero-product selection, image-based search, and wardrobe
  auto-tagging.
- **Pakistani fashion brand websites** (Beechtree, Limelight, Zellbury, Alkaram
  Studio, Gul Ahmed, Stylo, ECS, Borjan, Hush Puppies, Ndure) — scraped on a
  daily cron via a 3-strategy scraper pipeline (Shopify Collection JSON →
  Shopify All Products JSON → HTML/Cheerio fallback).

### Layering

```
            ┌───────────────────────────────┐
            │       Express Routes          │  routes/*.js
            └───────────────┬───────────────┘
                            │
            ┌───────────────▼───────────────┐
            │   Controllers (inline)        │  Each route file owns its handlers
            └───────────────┬───────────────┘
                            │
            ┌───────────────▼───────────────┐
            │          Services             │  services/recommendationEngine.js
            │                               │  services/colorTheory.js
            └───────────────┬───────────────┘
                            │
            ┌───────────────▼───────────────┐
            │      Mongoose Models          │  models/*.js
            └───────────────┬───────────────┘
                            │
            ┌───────────────▼───────────────┐
            │           MongoDB             │
            └───────────────────────────────┘

            ┌───────────────────────────────┐
            │         Cron + Jobs           │  jobs/scraperJob.js
            └───────────────┬───────────────┘
                            │
            ┌───────────────▼───────────────┐
            │     Scraper Orchestrator      │  scripts/scrapers/index.js
            │   ┌──────────────────────┐    │
            │   │  BaseAdapter         │    │
            │   │   ├ Strategy 1: Coll │    │
            │   │   ├ Strategy 2: All  │    │
            │   │   └ Strategy 3: HTML │    │
            │   └──────────────────────┘    │
            │   Brand Adapters (10)         │
            │   Extractors / Parsers / Utils│
            └───────────────────────────────┘
```

### Key Conventions

- **ES Modules** throughout (`"type": "module"` in `package.json`).
- **Separate `controllers/` directory** — all handler logic lives in
  `controllers/*.js`. Route files are thin wiring only (import controller,
  wire to `router.get/post/put/delete`).
- **JWT auth** with the `protect` middleware; admin-only routes use
  `adminOnly` (auth is currently relaxed on `/api/admin/*` for development —
  see notes in section 10.6).
- **Rate limiting** is split between a global limiter (300 req / 15 min) and a
  stricter auth limiter (20 req / 15 min).
- **Helmet** for security headers; **CORS** restricted to the frontend origin.
- **Mongoose** for ODM with rich indexes and pre-save hooks.
- **Multer (memory storage)** for image uploads (no disk persistence — buffers
  are sent straight to Gemini).

---

## 2. Tech Stack & Dependencies

From `backend/package.json`:

```json
{
  "name": "fashion-backend",
  "version": "1.0.0",
  "type": "module"
}
```

### Runtime Dependencies

| Package | Version | Purpose |
| --- | --- | --- |
| `express` | ^4.21.2 | HTTP server / routing |
| `mongoose` | ^8.12.0 | MongoDB ODM |
| `bcryptjs` | ^3.0.3 | Password hashing (User model pre-save) |
| `jsonwebtoken` | ^9.0.3 | JWT issue/verify in `auth.js` |
| `cors` | ^2.8.5 | Cross-origin support |
| `helmet` | ^8.1.0 | Security HTTP headers |
| `express-rate-limit` | ^8.5.1 | Throttling |
| `dotenv` | ^16.4.7 | Environment variable loading |
| `multer` | ^2.1.1 | `multipart/form-data` image uploads |
| `axios` | ^1.7.9 | HTTP client used by scrapers |
| `cheerio` | ^1.0.0 | HTML parser fallback for non-Shopify scrapes |
| `node-cron` | ^4.2.1 | Daily scrape scheduling |
| `uuid` | ^14.0.0 | Run IDs for scraper logs (legacy import; current `index.js` uses ISO timestamps) |
| `@google/generative-ai` | ^0.24.1 | Gemini SDK (chat intent, master stylist, image search, wardrobe tagging) |

### Dev Dependencies

| Package | Purpose |
| --- | --- |
| `nodemon` | Hot-reload for `npm run dev` |
| `cross-env` | Cross-platform env variable assignment for `npm run scrape:dry` |

---

## 3. Directory Structure

```
backend/
├── config/
│   └── db.js                       # MongoDB connection helper
├── jobs/
│   └── scraperJob.js               # Daily cron wrapper for the scraper
├── middleware/
│   └── auth.js                     # JWT `protect` + `adminOnly`
├── models/
│   ├── Favorite.js                 # User <-> Product join doc
│   ├── Outfit.js                   # Saved curated outfit
│   ├── Product.js                  # Unified product schema (clothing/shoes/accessories)
│   ├── ScraperLog.js               # Per-run scrape audit trail
│   ├── User.js                     # Account + preferences + role
│   └── WardrobeItem.js             # User-uploaded clothing item
├── controllers/
│   ├── recommendationsController.js  # Intent parsing + outfit generation logic
│   ├── productsController.js         # Product CRUD + featured + stats
│   ├── authController.js             # Register / login / me
│   ├── searchController.js           # Full-text + fallback + suggestions
│   ├── favoritesController.js        # Toggle / list / check
│   ├── adminController.js            # Dashboard stats + scraper control + SSE
│   ├── vectorSearchController.js     # HuggingFace semantic search
│   ├── imageSearchController.js      # Gemini visual search
│   ├── tryonController.js            # Replicate IDM-VTON
│   ├── wardrobeController.js         # User wardrobe CRUD + AI tagging
│   └── outfitsController.js          # Saved outfit boards CRUD
├── routes/
│   ├── admin.js                    # → adminController
│   ├── auth.js                     # → authController
│   ├── favorites.js                # → favoritesController
│   ├── imageSearch.js              # → imageSearchController
│   ├── outfits.js                  # → outfitsController
│   ├── products.js                 # → productsController
│   ├── recommendations.js          # → recommendationsController
│   ├── search.js                   # → searchController
│   └── wardrobe.js                 # → wardrobeController
├── scripts/
│   ├── scrapers/
│   │   ├── adapters/
│   │   │   ├── BaseAdapter.js      # 3-strategy pipeline base class
│   │   │   ├── AlkaramAdapter.js
│   │   │   ├── BeechtreeAdapter.js
│   │   │   ├── BorjanAdapter.js
│   │   │   ├── ECSAdapter.js
│   │   │   ├── GulAhmedAdapter.js
│   │   │   ├── HushPuppiesAdapter.js
│   │   │   ├── LimelightAdapter.js
│   │   │   ├── NdureAdapter.js
│   │   │   ├── StyloAdapter.js
│   │   │   └── ZellburyAdapter.js
│   │   ├── config/
│   │   │   ├── clothingBrands.js   # 5 brands × ~15 collections each
│   │   │   └── shoeBrands.js       # 5 shoe brands × ~6 collections each
│   │   ├── extractors/
│   │   │   ├── htmlExtractor.js    # Cheerio fallback
│   │   │   └── shopifyExtractor.js # /products.json variants
│   │   ├── parsers/
│   │   │   └── productParser.js    # Raw -> Product schema with inference
│   │   ├── utils/
│   │   │   ├── colorInference.js   # Title/description -> color
│   │   │   ├── logger.js           # File + console JSON-line logger
│   │   │   └── requestUtils.js     # UA pool, polite sleep, retry, axios
│   │   ├── index.js                # Orchestrator (the "real" runner)
│   │   ├── scraper.js              # LEGACY 5-brand single-file scraper
│   │   └── scraper.test.js         # node:test unit tests for scraper.js
│   ├── clearDB.js                  # Wipe products / scraperlogs / favorites / outfits
│   ├── testAIStylist.js            # End-to-end Master Stylist smoke test
│   └── testGemini.js               # Verify GEMINI_API_KEY connectivity
├── services/
│   ├── colorTheory.js              # 15-color compatibility matrix + scoring
│   ├── aiService.js                # rankProductsWithAI + multi-provider intent parsing
│   └── recommendationEngine.js     # Progressive relaxation + shoe matching
├── package.json
├── package-lock.json
├── server.js                       # App entry point
├── test-output.txt                 # Captured CLI output (not application code)
└── test_gemini.js                  # Stray top-level Gemini smoke test (uses @google/genai)
```

---

## 4. Environment Variables

Loaded from `backend/.env` by `dotenv`. The scraper additionally tries
`frontend/.env.local` as a fallback (legacy `scraper.js` only).

| Variable | Used By | Default | Notes |
| --- | --- | --- | --- |
| `PORT` | `server.js` | `5000` | HTTP listen port |
| `MONGO_URI` | `config/db.js`, `clearDB.js`, `testAIStylist.js` | `mongodb://localhost:27017/ai-fashion-stylist` | MongoDB connection string |
| `JWT_SECRET` | `routes/auth.js`, `middleware/auth.js` | — (required) | HMAC secret for tokens (30-day expiry) |
| `FRONTEND_URL` | `server.js` (CORS) | `['http://localhost:3000', 'http://localhost:5173']` | Allowed origin |
| `NODE_ENV` | `server.js` (error sanitization), banner | `development` | Hides error details in `production` |
| `GEMINI_API_KEY` | `aiService.js`, `imageSearch.js`, `wardrobe.js`, test scripts | — | Google AI Studio key (primary AI) |
| `GROQ_API_KEY` | `aiService.js` | — | Groq API key — intent parsing fallback 1 (Llama 3.1 8B) |
| `OPENROUTER_API_KEY` | `aiService.js` | — | OpenRouter key — intent parsing fallback 2 (Gemma 2 9B) |
| `SCRAPER_DRY_RUN` | `scripts/scrapers/index.js`, `scraper.js` | `false` | When `true`, no DB writes |
| `SCRAPER_CRON_SCHEDULE` | `jobs/scraperJob.js` | `0 3 * * *` | cron expression (Asia/Karachi TZ) |
| `SCRAPER_MAX_PER_BRAND` | `BaseAdapter.js`, legacy `scraper.js` | `50` (BaseAdapter) / `25` (legacy) | Max products per brand collection |
| `SCRAPER_DELAY_MS` | `requestUtils.politeSleep` | `1500` | Base sleep between requests (±30 % jitter) |
| `SCRAPER_RETRY_LIMIT` | `requestUtils.withRetry` | `3` | Max attempts with exponential backoff |

---

## 5. NPM Scripts

Defined in `backend/package.json`:

| Script | Command | Purpose |
| --- | --- | --- |
| `start` | `node server.js` | Production launch |
| `dev` | `nodemon server.js` | Local development with hot reload |
| `scrape` | `node scripts/scrapers/index.js` | Full scrape using the orchestrator |
| `scrape:dry` | `cross-env SCRAPER_DRY_RUN=true node scripts/scrapers/index.js` | Dry run — fetches & validates but does not touch the DB |
| `test` | `node --test` | Runs all `*.test.js` files via the built-in Node test runner (currently `scripts/scrapers/scraper.test.js`) |

---

## 6. Entry Point — `server.js`

`backend/server.js` is the single Express bootstrap. It is intentionally thin:
middleware → routes → 404 → global error handler → bootstrap.

### 6.1 Imports & dotenv

It computes `__dirname` from `import.meta.url` (because ESM lacks built-in
`__dirname`) and explicitly loads `backend/.env`:

```js
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });
```

### 6.2 Security Middleware

```js
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
```

`crossOriginResourcePolicy: 'cross-origin'` is needed so the frontend can load
any image URLs returned by API responses without being blocked.

### 6.3 Rate Limiters

Two limiters are configured:

| Limiter | Window | Max | Applied To |
| --- | --- | --- | --- |
| `globalLimiter` | 15 min | 300 req | Every request (`app.use(globalLimiter)`) |
| `authLimiter` | 15 min | 20 req | Only `/api/auth/*` routes |

Both return JSON `{ error: '...' }` with HTTP 429.

### 6.4 Body Parsing

```js
app.use(express.json({ limit: '10mb' }));   // 10 MB cap supports embedded base64 thumbnails
app.use(express.urlencoded({ extended: true }));
```

### 6.5 Route Mounting

| Path | Router |
| --- | --- |
| `/api/auth` | `routes/auth.js` (with `authLimiter`) |
| `/api/products` | `routes/products.js` |
| `/api/recommendations` | `routes/recommendations.js` |
| `/api/outfits` | `routes/outfits.js` |
| `/api/search/visual` | `routes/imageSearch.js` |
| `/api/wardrobe` | `routes/wardrobe.js` |
| `/api/search` | `routes/search.js` |
| `/api/favorites` | `routes/favorites.js` |
| `/api/admin` | `routes/admin.js` |

> Route order matters: `/api/search/visual` is mounted **before** `/api/search`
> so the visual subpath isn't accidentally swallowed by the search router.

### 6.6 Health Check

```http
GET /api/health  →  200  { status: 'ok', timestamp, version: '1.0.0' }
```

### 6.7 404 Handler

Any unmatched request returns:

```json
{ "error": "Route not found: <METHOD> <PATH>" }
```

with HTTP 404.

### 6.8 Global Error Handler

Logs the error to `console.error` and responds:

```js
res.status(err.status || 500).json({
  error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
});
```

Production hides the raw message; development surfaces it for debugging.

### 6.9 Bootstrap

```js
async function bootstrap() {
  await connectDB();
  app.listen(PORT, () => { /* banner */ });
  startScraperJob();          // installs the cron
}
bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

The cron is registered in-process; killing the API also kills scheduled scrapes.

---

## 7. Configuration — `config/`

### 7.1 `config/db.js`

Single export `connectDB()`. Reads `MONGO_URI` (default
`mongodb://localhost:27017/ai-fashion-stylist`), calls `mongoose.connect`, logs
success, and on error logs and `process.exit(1)`.

```js
const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ai-fashion-stylist';
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};
```

This is invoked from `server.js`, `scripts/scrapers/index.js`, and the test
scripts. Mongoose 8 no longer needs the legacy connection options.

---

## 8. Middleware — `middleware/`

### 8.1 `middleware/auth.js`

Two named exports.

#### `protect(req, res, next)`

1. Reads `Authorization` header; rejects if missing or not `Bearer …` (`401`).
2. Verifies the token with `jwt.verify(token, process.env.JWT_SECRET)`.
3. Loads the user via `User.findById(decoded.id).select('-password')`.
4. If no user, returns `401`.
5. Attaches the user document to `req.user` and calls `next()`.

Any verify failure (expired, malformed) returns `401 { error: 'Not authorized — invalid token' }`.

#### `adminOnly(req, res, next)`

Must run **after** `protect` (since it inspects `req.user.role`). Returns `403`
unless `req.user.role === 'admin'`. Used for protected admin endpoints, but
note that `routes/admin.js` currently does **not** mount it (development mode —
see 10.6 for the explicit comment in code).

---

## 9. Models — `models/`

All schemas use `import mongoose from 'mongoose'` and the
`mongoose.models.X || mongoose.model('X', schema)` idiom (where applied) to
prevent OverwriteModelError on hot-reload.

### 9.1 `User.js`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `String` | required, trimmed |
| `email` | `String` | required, **unique**, lowercased |
| `password` | `String` | required, min length 6, **never returned** |
| `role` | `String` enum `['user','admin']` | default `'user'` |
| `preferences.occasions` | `[String]` | onboarding |
| `preferences.styles` | `[String]` | onboarding |
| `preferences.favoriteColors` | `[String]` | onboarding |
| `preferences.budget` | `Number` | default 0 |
| `favoriteProducts` | `[ObjectId]` ref `'Product'` | quick-access list (kept in sync conceptually with the `Favorite` join collection) |
| `timestamps` | `createdAt`, `updatedAt` | auto |

#### Hooks & methods

- **`pre('save')`** — if `password` was modified, generates a bcrypt salt
  (`saltRounds=10`) and hashes the password. This means you can do
  `user.password = 'newpw'; await user.save();` without re-hashing manually.
- **`matchPassword(plain)`** — wraps `bcrypt.compare`.
- **`toJSON()`** — overridden to delete `password` from the serialized output,
  so even if a controller accidentally returns the document the password is
  stripped.

### 9.2 `Product.js` (the most important model)

A unified schema for **clothing**, **shoes**, and **accessories** so the
recommender can reason across categories.

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | `String` (req, trim, max 200) | Display name |
| `brand` | `String` (req, trim) | e.g. `Beechtree`, `Stylo` |
| `category` | enum `['clothing','shoes','accessories']` (req) | High-level type |
| `subCategory` | enum (see below) | Default `'other'` |
| `type` | `String` | Free text — fabric / heel type / etc. |
| `style` | `[String]` | e.g. `['embroidered','elegant']` |
| `occasion` | `[String]` | e.g. `['wedding','eid']` |
| `season` | `[String]` | e.g. `['summer']` or `['all-season']` |
| `fabric` | `String` | "Lawn", "Chiffon", … |
| `dressStyle` | `String` enum | `saree\|lehenga\|frock\|maxi\|shalwar-kameez\|kurta\|co-ord\|palazzo\|western` |
| `stitching` | `String` enum | `stitched \| unstitched`, default `'stitched'` |
| `print` | `String` enum | `embroidered\|printed\|plain\|embellished\|mixed` |
| `pieces` | `Number` | Piece count: 1, 2, or 3 |
| `primaryExactColor` | `String` | Exact scraped shade, e.g. `"maroon"` (synced from `exactColors[0]` via pre-save) |
| `exactColors` | `[String]` | All exact scraped shades, e.g. `["maroon","golden"]` |
| `colors` | `[String]` | Canonical color families, e.g. `["Red","Gold"]` (unchanged) |
| `primaryColor` | `String` | Dominant canonical family, e.g. `"Red"` (unchanged) |
| `sizes` | `[String]` | Variant sizes from Shopify |
| `images` | `[String]` | Absolute URLs |
| `imageUrl` | `String` | Primary (also kept in sync via `pre('save')`) |
| `description` | `String` (max 2000) | Stripped of HTML |
| `tags` | `[String]` | Free-form |
| `price` | `Number` (req, min 0) | Always integer PKR |
| `compareAtPrice` | `Number` | Pre-sale price |
| `currency` | `String` | Default `'PKR'` |
| `productUrl` | `String` (req, **unique**) | Source URL — used as upsert key |
| `source` | `String` | Adapter class name |
| `handle` | `String` | Shopify handle |
| `embedding` | `[Number]` | Future semantic vector (unused at runtime today) |
| `embeddingModel` | `String` | e.g. `'text-embedding-3-small'` |
| `metadataScore` | `Number` (default 0) | 0-1 completeness score |
| `scrapedAt` | `Date` | Aliased to `createdAt` via `timestamps` |
| `updatedAt` | `Date` | Auto |

`subCategory` enum (combined): `'2-piece'`, `'3-piece'`, `'kurta'`, `'pants'`,
`'shalwar'`, `'dupatta'`, `'western'`, `'festive'`, `'unstitched-2-piece'`,
`'unstitched-3-piece'`, `'heels'`, `'flats'`, `'sandals'`, `'sneakers'`,
`'khussa'`, `'boots'`, `'mules'`, `'jewelry'`, `'bags'`, `'scarves'`, `'other'`.

#### Indexes

```js
ProductSchema.index({ brand: 1, category: 1 });
ProductSchema.index({ category: 1, subCategory: 1 });
ProductSchema.index({ primaryColor: 1, category: 1 });
ProductSchema.index({ stitching: 1, category: 1 });    // new
ProductSchema.index({ print: 1, category: 1 });        // new
ProductSchema.index({ dressStyle: 1, category: 1 });   // new
ProductSchema.index({ occasion: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });
```

The text index powers `/api/search` (with regex fallback when zero hits).
The three new compound indexes (`stitching+category`, `print+category`, `dressStyle+category`)
support the progressive relaxation DB queries in the recommendation engine.

#### Virtual

`primaryImage` — returns `imageUrl ?? images[0] ?? null`.

#### Pre-save hook

- If `images` exists and `imageUrl` is empty → set `imageUrl = images[0]`.
- If `imageUrl` exists and `images` is empty → set `images = [imageUrl]`.
- If `primaryColor` is empty and `colors` has at least one entry → set
  `primaryColor = colors[0]`.

This guarantees that whatever path the data took (Shopify mapping vs HTML
fallback), the resulting document has a usable image and color.

### 9.3 `Favorite.js`

Explicit join model `{ user, product }` with a compound unique index
`{ user: 1, product: 1 }`. Provides full query flexibility — e.g. "all users
who favorited product X" — and prevents duplicate favorites at the DB level
(handled gracefully in the toggle endpoint via the `11000` duplicate key catch).

### 9.4 `Outfit.js`

| Field | Type |
| --- | --- |
| `user` | `ObjectId` → `User` (req) |
| `name` | `String`, default `'My Curated Look'` |
| `heroProduct` | `ObjectId` → `Product` (req) |
| `accessories` | `[ObjectId]` → `Product` |
| `stylistReasoning` | `String` |
| `occasion` | `[String]` |
| `createdAt` | `Date` (default `Date.now`) |

Note: this model uses a manual `createdAt` rather than `{ timestamps: true }`.

### 9.5 `WardrobeItem.js`

A user-uploaded clothing item, AI-tagged on creation:

| Field | Type |
| --- | --- |
| `user` | `ObjectId` → `User` (req) |
| `name` | `String` (auto-set to `subCategory` from Gemini) |
| `category` | enum `['clothing','shoes','accessories']` (req) |
| `subCategory` | `String` (free, e.g. "Kurta", "Heels") |
| `primaryColor` | `String` |
| `imageUrl` | `String` (currently a placeholder URL — see roadmap note in route) |
| `tags` | `[String]` |
| `createdAt` | `Date` |

### 9.6 `ScraperLog.js`

A per-run audit trail consumed by the admin dashboard.

| Field | Type | Notes |
| --- | --- | --- |
| `runId` | `String` (req, **unique**) | ISO timestamp string used by orchestrator |
| `status` | enum `['running','completed','failed','partial']` | default `'running'` |
| `triggeredBy` | `String` | `'cron' \| 'admin' \| 'manual' \| 'cli'` |
| `startedAt` | `Date` | default now |
| `completedAt` | `Date` | filled on finalize |
| `durationMs` | `Number` | filled on finalize |
| `stats.totalBrands` | `Number` | length of combined config arrays |
| `stats.totalInserted` | `Number` | aggregate |
| `stats.totalUpdated` | `Number` | aggregate |
| `stats.totalSkipped` | `Number` | aggregate |
| `stats.totalFailed` | `Number` | aggregate |
| `brandResults[]` | embedded array | per-brand outcome (brand, url, counts, strategy, error) |
| `failedUrls[]` | `[{url, reason}]` | unused today but available for re-investigation |
| `error` | `String` | top-level error if the whole run crashes |
| `timestamps` | yes | `createdAt`/`updatedAt` |

---

## 10. Routes & Controllers — `routes/`

Each route file constructs an `express.Router()`, defines its handlers inline,
and exports the router as default. Every endpoint and its exact behavior is
listed below.

### 10.1 `routes/auth.js`  →  mounted at `/api/auth` (with `authLimiter`)

Helper: `generateToken(id)` returns a JWT signed with `JWT_SECRET`, expiring in
`30d`.

#### `POST /api/auth/register`

Body: `{ name, email, password }`.

1. Validates all three fields are present (`400` otherwise).
2. Checks for an existing user with that email (`409` if found).
3. Promotes the **first** registered user to `admin`
   (`if ((await User.countDocuments()) === 0) role = 'admin'`).
4. Creates the user (password hashed by the User pre-save hook).
5. Returns `201 { user, token }` (password stripped via `toJSON`).

#### `POST /api/auth/login`

Body: `{ email, password }`.

1. Validates both fields (`400` otherwise).
2. Loads user by email; if missing OR `matchPassword` fails → `401 'Invalid email or password'`.
3. Returns `200 { user, token }`.

#### `GET /api/auth/me` — **protected**

`protect` middleware attaches `req.user`. Returns `{ user: req.user }`.

### 10.2 `routes/products.js`  →  mounted at `/api/products`

#### `GET /api/products`

Paginated browsable catalogue with filters.

Query parameters (all optional):

| Param | Effect |
| --- | --- |
| `page` | default 1 |
| `limit` | clamped to `[1, 48]`, default 24 |
| `category` | exact match |
| `brand` | case-insensitive regex |
| `subCategory` | exact match |
| `color` | matches `primaryColor` OR any of `colors[]` (case-insensitive regex) |
| `occasion` | `$in` (accepts a single value or an array) |
| `style` | `$in` (accepts a single value or an array) |
| `minPrice`, `maxPrice` | numeric range |
| `sort` | field name, default `scrapedAt` |
| `order` | `'asc' \| 'desc'`, default `'desc'` |

Always excludes the heavy `embedding` field via `.select('-embedding')`.

Response:

```json
{
  "products": [...],
  "pagination": { "page", "limit", "total", "totalPages", "hasMore" }
}
```

#### `GET /api/products/featured`

Random sample of 6 clothing + 4 shoes (each must have a non-empty `images`
array). Implemented with `$sample` aggregation and `$project: { embedding: 0 }`.

```json
{ "featured": [ ...10 items ] }
```

#### `GET /api/products/stats`

| Field | Computation |
| --- | --- |
| `total` | `countDocuments()` |
| `byCategory` | `[{ _id, count }]` grouped by category |
| `topBrands` | top 10 brands by product count |
| `priceRange` | `{ min, max, avg }` over all `price` |

#### `GET /api/products/:id`

Single product by Mongo `_id`. Returns `404` if not found, `400` on
`CastError` (invalid ObjectId).

> **Order of definitions matters**: `featured` and `stats` are defined **before**
> `:id` so they are not swallowed by the parametric route.

### 10.3 `routes/recommendations.js`  →  mounted at `/api/recommendations`

Routes are thin wiring only; all logic lives in `controllers/recommendationsController.js`.

```js
router.get('/:productId', getProductRecommendations);
router.post('/outfit', generateOutfit);
```

> **Important**: POST `/outfit` must be defined **before** `/:productId` so
> the string `"outfit"` is not caught by the param route.

#### `POST /api/recommendations/outfit` — `generateOutfit`

Chat-driven outfit recommendation.

Body: `{ message: string }` — natural language, e.g. *"maroon unstitched 3-piece for wedding"*

**Intent parsing** (`aiService.parseIntentWithFallback`):

Multi-provider fallback chain: Gemini 2.5 Flash → Groq Llama 3.1 → OpenRouter Gemma 2 → Gemini 1.5 Flash.

Extracted intent fields:

| Field | Type | Notes |
|-------|------|-------|
| `colorExact` | string\|null | Exact word user said, e.g. "maroon" |
| `colorFamily` | string | Canonical family, e.g. "Red". "Any" if not mentioned |
| `occasion` | string[] | Empty `[]` if not mentioned |
| `dressStyle` | string\|null | One of 9 styles or null |
| `stitching` | string\|null | `"stitched"` \| `"unstitched"` \| null |
| `pieces` | number\|null | 1/2/3 or null |
| `print` | string\|null | embroidered/printed/plain/embellished or null |
| `fabric` | string\|null | e.g. "lawn" or null |
| `maxBudget` | number | 0 if not mentioned |

**Key principle**: only fields the user explicitly mentioned are used as DB filters.

**Progressive relaxation** (`recommendationEngine.fetchCandidates`):

Drops one constraint per level until ≥ 50 products found:
`occasion → print → dressStyle → stitching → pieces → fabric → exact color → canonical family → none`

**AI ranking** (`aiService.rankProductsWithAI`):

Top 50 candidates sent to Gemini 2.5 Flash which ranks them and returns a one-sentence match reason per product. Top 10 returned.

**Shoe matching**: one best shoe per dress via `scoreProduct(dress, shoe) = embedding×0.5 + color×0.2 + occasion×0.2 + style×0.1`.

Response:
```json
{
  "intent": { "colorExact": "maroon", "colorFamily": "Red", "stitching": "unstitched",
              "pieces": 3, "occasion": ["wedding"], ... },
  "results": [
    { "product": {...}, "rank": 1, "matchReason": "...",
      "shoe": { "product": {...}, "score": 0.87, "reason": "..." } }
  ],
  "matchQuality": { "tier": "exact", "totalFound": 12, "message": null },
  "relaxationMessage": null
}
```

Match quality tiers: `exact` (no drops) → `close` (≥8) → `similar` (≥4) → `loose`

#### `GET /api/recommendations/:productId` — `getProductRecommendations`

Product-page "shop the look" recommendations.

1. Calls `getRecommendations(productId, { maxShoes: 6, maxClothing: 6 })` from the engine.
2. Returns:

```json
{
  "source": { ...product },
  "shoes": [{ "product": {...}, "scores": { "total": 0.91, ... } }],
  "complementaryClothing": [{ "product": {...}, "scores": {...} }],
  "generatedAt": "<Date>"
}
```

3. Errors: `404 Product not found` / `500` for anything else.

### 10.4 `routes/search.js`  →  mounted at `/api/search`

#### `GET /api/search`

Composite text + filter search.

Query: `q`, `category`, `color`, `occasion`, `minPrice`, `maxPrice`, `page`,
`limit` (clamped to `[1, 48]`).

Logic:

- **If `q` is non-empty** → use the MongoDB text index
  (`$text: { $search: q }`) sorted by `textScore` and apply the same filters
  as `/api/products`.
- **Fallback** if text returns 0: build a regex `$or` over `name`, `brand`,
  `tags`, `description`, then sort by `metadataScore` desc, `scrapedAt` desc.
- **If `q` is empty** → just a filtered browse sorted by `scrapedAt` desc.

Always excludes `embedding`. Response shape mirrors `/api/products`:

```json
{ "query": "...", "products": [...], "pagination": { ... } }
```

#### `GET /api/search/suggestions`

Lightweight autocomplete:

- Requires `q.length >= 2`.
- Regex `name` match, `limit(8)`, returning `[{ id, label, category }]` where
  `label = "<name> — <brand>"`.

### 10.5 `routes/favorites.js`  →  mounted at `/api/favorites` (all routes `protect`-ed)

Note: `router.use(protect)` is applied once at the top, so every endpoint here
requires a valid JWT.

#### `GET /api/favorites`

Returns the user's favorites (joined with the Product) sorted by newest first.
Response: `{ favorites: [Product...], count: number }`.

#### `POST /api/favorites/:productId` (toggle)

1. Verifies the product exists (`404` otherwise).
2. If a `Favorite { user, product }` already exists → deletes it and responds
   `200 { favorited: false, message: 'Removed from favorites' }`.
3. Otherwise creates one and responds
   `201 { favorited: true, message: 'Added to favorites' }`.
4. On unique-key collision (`err.code === 11000`) responds gracefully
   `{ favorited: true, message: 'Already in favorites' }`.

#### `DELETE /api/favorites/:productId`

Hard-delete the favorite. Always returns `200 { favorited: false, message: 'Removed from favorites' }` (idempotent — returns success even if it didn't exist).

#### `GET /api/favorites/check/:productId`

Cheap `Favorite.exists(...)` returning `{ favorited: boolean }`.

### 10.6 `routes/admin.js`  →  mounted at `/api/admin`

> **Auth note (in code):** `// NOTE: Auth removed for development. Re-add `protect, adminOnly` middleware in production.`
> Treat every endpoint here as **publicly reachable today**.

#### Module-level state

```js
let activeScrapePromise = null;     // prevents concurrent runs
const sseClients = new Set();       // active EventSource clients
```

A named export `broadcastScraperEvent(data)` writes
`data: ${JSON.stringify(data)}\n\n` to every connected SSE client and prunes
broken connections.

#### `GET /api/admin/stats`

Aggregates:

- `total` — `Product.countDocuments()`
- `byCategory` — flattened to `{ clothing: 1234, shoes: 567, ... }`
- `byBrand` — `[{ _id: brand, count }]`, sorted desc
- `recentWeek` — count where `scrapedAt >= now - 7d`
- `priceRange` — `{ min, max, avg }`

#### `GET /api/admin/scraper/logs?limit=20`

Returns the most recent `ScraperLog` entries (newest first).

#### `GET /api/admin/scraper/status`

```json
{
  "isRunning": <boolean>,
  "latest":   <ScraperLog | null>
}
```

`isRunning` is derived from `latest.status === 'running'`.

#### `GET /api/admin/scraper/stream` (Server-Sent Events)

1. Sets the SSE headers (`Content-Type: text/event-stream`,
   `Cache-Control: no-cache`, `Connection: keep-alive`,
   `X-Accel-Buffering: no` for nginx).
2. Sends an immediate `data: {"type":"connected", "message":"SSE stream established"}`.
3. Adds the response object to the `sseClients` set.
4. Heartbeat comment (`: heartbeat\n\n`) every 25 s to keep the connection
   alive through proxies.
5. On `req.close`, clears the heartbeat and removes the client from the set.

#### `POST /api/admin/scraper/run`

1. Reads `ScraperLog.findOne({ status: 'running' })` — if anything is in
   progress, returns `409 { error, runId }`.
2. Immediately replies `200 { message, startedAt }`.
3. Broadcasts a `started` SSE event.
4. Lazily imports `scripts/scrapers/index.js` (to avoid pulling axios/cheerio
   into the request hot path) and assigns a promise to the in-memory
   `activeScrapePromise`. On success/failure broadcasts `completed` or
   `error` events; the `finally` clears the promise so future runs are
   permitted.

#### `DELETE /api/admin/products/brand/:brand`

Bulk-delete all products from a given brand. Returns
`{ deleted: <count>, brand: <name> }`. Useful when a scraper started writing
junk and you need to reset just that brand.

### 10.7 `routes/outfits.js`  →  mounted at `/api/outfits` (every endpoint `protect`-ed)

#### `POST /api/outfits`

Body: `{ heroProductId, accessoryIds, reasoning, name, occasion }`.

Creates an `Outfit { user, name?, heroProduct, accessories[], stylistReasoning, occasion[] }` and returns it populated with the actual `heroProduct` and `accessories` documents.

#### `GET /api/outfits`

Returns the user's outfits (`-createdAt`) populated with `heroProduct` and
`accessories`.

#### `DELETE /api/outfits/:id`

Ensures the outfit belongs to the requesting user (`404` otherwise) and
deletes it. Returns `{ message: 'Outfit removed' }`.

### 10.8 `routes/imageSearch.js`  →  mounted at `/api/search/visual`

Uses `multer({ storage: multer.memoryStorage() })` so the uploaded image lives
only in memory.

#### `POST /api/search/visual/image`  (form-data field: `image`)

1. Returns `400` if `req.file` is missing.
2. Initializes `GoogleGenerativeAI(GEMINI_API_KEY)` and grabs
   `gemini-1.5-flash`.
3. Sends the image (`base64` from `req.file.buffer`) plus a prompt requesting:
   ```json
   { "category": "...", "color": "...", "style": "...", "keywords": ["..."] }
   ```
4. Strips ```` ```json ```` fences and `JSON.parse`s the analysis.
5. Builds a Mongo query:
   - `$or`: `primaryColor` regex on the inferred color OR `name` regex on the
     first keyword.
   - If `analysis.category` mentions "shoe" → forces `category: 'shoes'`,
     otherwise `'clothing'`.
6. Returns up to 10 matches:

```json
{
  "analysis": { ... },
  "matches": [...],
  "message": "Found N items matching your photo!"
}
```

### 10.9 `routes/wardrobe.js`  →  mounted at `/api/wardrobe`

Uses Multer in-memory storage and Gemini 1.5 Flash like `imageSearch`.

#### `POST /api/wardrobe` — **protected**, multipart `image`

1. Validates the upload (`400` otherwise).
2. Asks Gemini to classify the image into:
   ```json
   {
     "category": "clothing|shoes|accessories",
     "subCategory": "...",
     "primaryColor": "...",
     "tags": ["..."]
   }
   ```
3. Persists a `WardrobeItem` with those AI fields. **Important caveat in
   code**: the `imageUrl` is a placeholder
   (`https://via.placeholder.com/400x500?text=My+Wardrobe+Item`) because no
   image storage backend (S3 / Cloudinary) is wired up yet. Replace this when
   integrating object storage.
4. Returns the saved item with `201`.

#### `GET /api/wardrobe` — **protected**

Returns the array of `WardrobeItem` belonging to the current user.

---

## 11. Services — `services/`

The service layer is intentionally small — only what cannot live inside a
route or model.

### 11.1 `services/colorTheory.js`

Implements fashion-specific color compatibility rules used by the recommender.

#### `COMPATIBILITY_MATRIX`

A nested object keyed by color name (Black, White, Red, Gold, Pink, Blue,
Green, Grey, Purple, Teal, Brown, Multicolor). Each entry maps another color
to a score between **0 and 1** (1 = perfect match, 0.7 = good, 0.5 = neutral,
≤ 0.3 = clash). Examples:

| A | B | Score | Reasoning |
| --- | --- | --- | --- |
| Black | White | 1.0 | Classic contrast |
| Black | Gold | 1.0 | Elegant |
| Red | Pink | 0.3 | Warm-tone clash |
| Red | Orange | 0.2 | Strong clash |
| Gold | Emerald | 0.95 | Luxe combo |
| Purple | Orange | 0.3 | Clash |

#### `NEUTRAL_COLORS`

`Set<'Black'|'White'|'Grey'|'Gold'|'Silver'|'Beige'|'Brown'>` — used as a
fall-back when an unknown pair appears.

#### `getColorCompatibilityScore(color1, color2)`

Normalizes both inputs (see below), returns:

- `0.5` if either is empty
- `0.75` if normalized colors are equal (monochrome — generally good)
- the matrix value (looked up both directions) if defined
- `defaultScore(c1, c2)` otherwise

#### `getColorArrayCompatibility(colors1[], colors2[])`

Returns the **best** pairwise score across the cartesian product. This means
"if at least one color from outfit A pairs well with one color from outfit B,
the overall score reflects that best pairing."

#### `normalize(color)` (private)

Maps brand/marketing terms to canonical names, e.g.:

- `navy / sky blue / cobalt` → `Blue`
- `emerald / olive / mint / sage` → `Green`
- `maroon / crimson / burgundy / wine / rust` → `Red`
- `beige / nude / camel / khaki` → `Gold`
- `silver / ash` → `Grey`, `charcoal` → `Black`
- `ivory / cream` → `White`
- `blush / peach / rose / fuchsia` → `Pink`
- `lavender / lilac / mauve / plum` → `Purple`
- `coral / terracotta / amber` → `Orange`
- `mustard / lemon / saffron` → `Yellow`
- `turquoise / aqua / cyan` → `Teal`
- `chocolate / mocha / coffee / caramel` → `Brown`

#### `defaultScore(c1, c2)` (private)

Returns `0.7` if either color is in `NEUTRAL_COLORS`, otherwise `0.5`.

### 11.2 `services/aiService.js`

Two exported functions used by the recommendation engine and controllers.

#### `rankProductsWithAI(products, intent)`

Sends up to 50 candidate products to **Gemini 2.5 Flash** for intelligent ranking.

- Builds a prompt with each product's full metadata (name, brand, price, exact color, occasion, dress style, print, stitching, fabric, first 300 chars of description) plus the user's original message and parsed intent.
- Asks Gemini to rank all products from best (rank 1) to worst and provide a one-sentence reason per product.
- Returns `[{ product, rank, reason }]` sorted by rank ascending.
- Falls back to original insertion order if Gemini fails.

#### `parseIntentWithFallback(message, prompt)`

Multi-provider intent parsing with automatic fallback:

```
Gemini 2.5 Flash (primary)
    ✓ → return JSON
    ✗ ↓
Groq Llama 3.1 8B (if GROQ_API_KEY set)
    ✓ → return JSON
    ✗ ↓
OpenRouter Gemma 2 9B (if OPENROUTER_API_KEY set)
    ✓ → return JSON
    ✗ ↓
Gemini 1.5 Flash (final fallback)
    ✓ → return JSON
    ✗ → throw "All AI providers exhausted"
```

All providers are called with `temperature: 0.1` and `responseMimeType: application/json` (where supported). The `extractJson` utility strips any markdown fences before `JSON.parse`.

### 11.3 `services/recommendationEngine.js`

The core recommendation logic. Three public exports:
`getOutfitForQuery`, `getRecommendations`, `scoreProduct`.

#### Helpers

- **`cosineSimilarity(a, b)`** — classic cosine; returns 0 if vectors are empty or mismatched.
- **`setOverlapScore(arr1, arr2)`** — Jaccard-ish ratio with `+0.2` smoothing, returns `0.4` partial credit when one side is empty.
- **`keywordSimilarity(p1, p2)`** — keyword overlap fallback when products lack embeddings.
- **`normalizeColor(color)`** — maps 180+ shade aliases to canonical color families.
- **`generateShoeMatchReason(shoe, dress)`** — produces a human-readable reason string.

#### `scoreProduct(source, candidate)`

Product-to-product scoring used for shoe matching and product-page recommendations:

```
total = embedding × 0.50 + colorTheory × 0.20 + occasionOverlap × 0.20 + styleOverlap × 0.10
```

Returns `{ total, embeddingSimilarity, colorCompatibility, occasionCompatibility, styleCompatibility }`.

#### `getSpecifiedConstraints(intent)`

Returns a `Set` of field names the user explicitly mentioned. Only these become DB filters. Fields absent from the set are never filtered.

Detects: `occasion`, `print`, `dressStyle`, `stitching`, `pieces`, `fabric`, `colorExact`, `colorFamily`.

#### `buildDBQuery(intent, dropped, colorMode)`

Constructs a MongoDB query object:
- Hard constraints always applied: `category: 'clothing'`, `gender`, `price: { $lte: maxBudget*1.2 }` (if set)
- Soft constraints applied if not in `dropped` Set: `occasion`, `print`, `dressStyle`, `stitching`, `pieces`, `fabric`
- Color modes: `'exact'` → `exactColors` elemMatch regex, `'family'` → `primaryColor` match, `'none'` → no color filter

#### `fetchCandidates(intent)`

Progressive relaxation engine. Builds a sequence of levels, each dropping one more constraint, and queries MongoDB at each level until ≥ 50 products are found (or all levels exhausted):

```
Level 0: all specified constraints + exact color
Level 1: drop occasion
Level 2: drop print
Level 3: drop dressStyle
Level 4: drop stitching
Level 5: drop pieces
Level 6: drop fabric
Level 7: exact color → canonical family
Level 8: drop color entirely
```

Each level queries with `limit(100)`. The level with the most results (up to 50 threshold) is used. Dropped fields are collected into `relaxationMessage`.

Returns `{ products, relaxationMessage, specified }`.

#### `matchShoesForProducts(dresses)`

For each dress, scores all shoes in the DB (up to 150) via `scoreProduct` and picks the best. Returns `[{ product, score, reason }]` one per dress.

#### `getOutfitForQuery(intent)` (public)

Orchestrates the full "Style Me" flow:

1. `fetchCandidates(intent)` — progressive relaxation until ≥50 results
2. `rankProductsWithAI(products.slice(0, 50), intent)` — Gemini ranks and annotates
3. `matchShoesForProducts(top10 dresses)` — one shoe per dress
4. Returns `{ results[10], matchQuality, relaxationMessage }`

#### `getRecommendations(productId, options)` (public)

Product-detail-page recommendations.

1. `Product.findById(productId)`.
2. Fetches shoe pool (100 shoes) + clothing pool (50–100 items).
3. Scores all candidates via `scoreProduct`, sorts, slices to `maxShoes`/`maxClothing`.
4. Returns `{ source, shoes, complementaryClothing, generatedAt }`.

---

## 12. Jobs — `jobs/`

### 12.1 `jobs/scraperJob.js`

Single export `startScraperJob()` invoked by `bootstrap()` in `server.js`.

```js
cron.schedule(schedule, async () => {
  logger.info('Cron triggered: starting daily fashion scrape...');
  try { await runScraper({ triggeredBy: 'cron' }); }
  catch (err) { logger.error('Cron scraper job failed:', err.message); }
}, { timezone: 'Asia/Karachi' });
```

- `schedule` defaults to `'0 3 * * *'` (3 AM daily).
- Errors are caught so the cron worker never crashes the process.
- Timezone explicitly set to **`Asia/Karachi`** to match the target market.

---

## 13. Scrapers — `scripts/scrapers/`

The scraper system was rewritten into a layered, adapter-based architecture.
There are **two** runners on disk:

1. **`scripts/scrapers/index.js`** — the **canonical** orchestrator wired to
   the cron and admin endpoint.
2. **`scripts/scrapers/scraper.js`** — a legacy single-file scraper (5 hard-coded
   brands) preserved for reference and unit tests
   (`scraper.test.js`). It is **not** run by the API.

### 13.1 Orchestrator — `scripts/scrapers/index.js`

#### Adapter Registry

```js
const ADAPTER_MAP = {
  BeechtreeAdapter, LimelightAdapter, ZellburyAdapter,
  AlkaramAdapter,   GulAhmedAdapter,  StyloAdapter,
  ECSAdapter,       BorjanAdapter,    HushPuppiesAdapter,
  NdureAdapter
};
```

The `adapter` string in each brand config (`clothingBrands.js` /
`shoeBrands.js`) is looked up here.

#### `upsertProduct(product)`

```js
const result = await Product.findOneAndUpdate(
  { productUrl: product.productUrl },
  { $set: product },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
const wasInserted = result.createdAt && (Date.now() - new Date(result.createdAt).getTime()) < 10000;
return wasInserted ? 'inserted' : 'updated';
```

The `< 10s` heuristic distinguishes brand-new docs from updates so the
orchestrator can compute insert/update counters.

#### `runScraper({ triggeredBy = 'manual' } = {})`

The full pipeline:

1. Read `SCRAPER_DRY_RUN`. If false, `connectDB()` and create a
   `ScraperLog { status: 'running', triggeredBy, stats.totalBrands }`.
2. For each entry in `[...CLOTHING_BRANDS, ...SHOE_BRANDS]`:
   - Look up the adapter class. Skip with a warning if missing.
   - `await adapter.scrapeAll()` — returns an array of
     `{ products, strategy, url }` objects (one per collection).
   - For each successful collection result, upsert each product (or log
     dry-run output). Track per-brand insert/update/skip/fail counts.
   - Push a row into `brandResults` with brand, url, counts, and the strategy
     used.
3. Update the `ScraperLog` to `completed` with `durationMs`, aggregated stats,
   and per-brand breakdown.
4. Print a colored summary banner via the logger.
5. Return aggregated `{ totalInserted, totalUpdated, totalSkipped, totalFailed, durationMs }` so the admin SSE stream can broadcast it.

#### CLI mode

A `pathToFileURL`-based check determines if the file is being run directly
(`node scripts/scrapers/index.js`). If so it calls `runScraper({ triggeredBy: 'cli' })` and exits.

### 13.2 BaseAdapter — `scripts/scrapers/adapters/BaseAdapter.js`

Abstract class implementing the **3-strategy pipeline**. All brand adapters
inherit from it.

#### Constructor

```js
constructor(brandConfig) {
  this.config   = brandConfig;
  this.brand    = brandConfig.brand;
  this.baseUrl  = brandConfig.baseUrl;
  this.category = brandConfig.category;
}
```

Each subclass sets a `this.shopifyKeywords` array used by Strategy 2 to filter
the site-wide `/products.json` endpoint down to relevant items.

#### `scrapeCollection(collection)` — the heart of the system

For the given collection (e.g. `{ path: '/collections/pret', subCategory, occasion, style }`):

1. Build the absolute `collectionUrl = baseUrl + path`.
2. `maxItems = SCRAPER_MAX_PER_BRAND` (default 50).
3. Build the `brandConfig` payload passed into `normalizeProduct` later.
4. **Strategy 1 — Shopify Collection JSON**:
   `await this.extractCollectionProducts(collectionUrl, maxItems)` (default
   delegates to `extractFromShopifyCollection`). If it returns products, that's
   the strategy for this collection.
5. **Strategy 2 — Shopify /products.json filtered**:
   `await extractFromShopifyAll(collectionUrl, maxItems, this.shopifyKeywords ?? [])`.
6. **Strategy 3 — HTML / Cheerio**:
   `await politeSleep()` then `extractFromHtml(collectionUrl, maxItems, this.getHtmlOptions())`.
7. If still empty → `{ products: [], strategy: 'failed', url }`.
8. Otherwise, normalize and validate every raw product:
   - If it has a `handle` (Shopify shape), call `mapShopifyProduct`.
   - `normalizeProduct(mapped, brandConfig)` produces the full Product schema
     payload (with inferred occasions/styles/colors/season/fabric).
   - `validateProduct(product)` enforces required fields and a positive price.
   - Polite micro-delay (200 ms) between processing iterations to avoid CPU
     hot loops and to be polite if subsequent requests are needed.

Returns `{ products: [normalized...], strategy, url }`.

#### `extractCollectionProducts(collectionUrl, maxItems)`

Default delegates to `extractFromShopifyCollection`. Subclasses may override
for non-Shopify storefronts (none currently do).

#### `getHtmlOptions()`

Default returns `{}`. Subclasses can supply a custom `urlValidator` for the
HTML extractor when product URLs don't follow `/products/...`.

#### `scrapeAll()`

Iterates `this.config.collections`, sleeps politely between, calls
`scrapeCollection`, returns an array of results plus a final log line:

```
[Beechtree] Total scraped: 412 products across 14 collections
```

### 13.3 Brand Adapters

Each one is a thin subclass that just sets `this.shopifyKeywords`:

| Adapter | `shopifyKeywords` |
| --- | --- |
| `BeechtreeAdapter` | `['suit','kurti','shirt','trouser','bottom','dress']` |
| `LimelightAdapter` | `['suit','kurti','shirt','dupatta','trouser','western']` |
| `AlkaramAdapter`   | `['suit','kurti','shirt','trouser','festive','lawn','embroidered']` |
| `GulAhmedAdapter`  | `['suit','lawn','kurti','formal','embroidered','unstitched','ready-to-wear']` |
| `ZellburyAdapter`  | (none — uses BaseAdapter directly via `super.scrapeAll()`) |
| `StyloAdapter`     | `['heels','flat','sandal','khussa','shoe','slipper']` |
| `ECSAdapter`       | `['heels','flat','sandal','loafer','mule','shoe']` |
| `BorjanAdapter`    | `['women','heels','flat','sandal','pump','wedge']` |
| `HushPuppiesAdapter` | `['women','casual','flat','sandal','loafer','moccasin']` |
| `NdureAdapter`     | `['women','sneaker','sandal','flat','slipper','sports']` |

`ZellburyAdapter` overrides `scrapeAll()` only to document that the standard
3-strategy pipeline is sufficient — it just calls `super.scrapeAll()`.

### 13.4 Extractors — `scripts/scrapers/extractors/`

#### `shopifyExtractor.js`

URL builders:

- **`buildCollectionJsonUrl(collectionUrl, limit, page)`** — appends
  `/products.json` to the collection path and adds `?limit=&page=`.
- **`buildSiteProductsJsonUrl(anyUrl, limit, page)`** — `<origin>/products.json`.

`fetchShopifyPage(url)` uses `withRetry(safeGet(url, { extraHeaders: { Accept: 'application/json' }, responseType: 'json' }))`.

`extractFromShopifyCollection(collectionUrl, maxItems = 250)`:

1. Aborts if URL doesn't contain `/collections/`.
2. Paginates from page 1 with the Shopify max page size (250).
3. Stops when a page returns fewer than 250 products (last page) or when
   `allProducts.length >= maxItems`.
4. Sleeps 800 ms between pages.
5. Slices to `maxItems` and returns `{ products, strategy: 'shopify-collection' }`
   (or `'failed'` if zero).

`extractFromShopifyAll(anyUrl, maxItems, keywords)`:

- Pulls a single page from `/products.json`, optionally filters by
  `matchesKeywords`, and returns `{ products, strategy: 'shopify-all' }`.

`mapShopifyProduct(rawProduct, baseOrigin)`:

Converts a Shopify product object into our intermediate normalized form:

| Output field | Source |
| --- | --- |
| `title` | `rawProduct.title` |
| `handle` | `rawProduct.handle` (required) |
| `images` | `rawProduct.images[].src` (or `image.src` fallback), normalized to absolute |
| `price` | first variant's price → integer |
| `compareAtPrice` | first variant's `compare_at_price` → integer |
| `productUrl` | `${origin}/products/${handle}` |
| `sizes` | `variants[].option1` filtered & sliced 20 |
| `tags` | from string or array |
| `description` | `body_html` stripped to plain text, capped at 1000 |
| `vendor`, `productType` | passthrough |
| `isAvailable` | `variants.some(v => v.available === true)` — used downstream to skip out-of-stock items |

Helpers: `normalizeImageUrl` (handles `//`, `http`, relative), `parsePrice`
(strips non-numerics, rounds), `stripHtml` (removes tags + collapses whitespace).

#### `htmlExtractor.js`

Cheerio-based fallback for non-Shopify or blocked sites.

Selector arrays (ordered by specificity):

- `PRODUCT_CONTAINER_SELECTORS` — `.product-item`, `.product-card`,
  `.grid__item`, `.product-grid-item`, `li.item.product`, `.grid-view-item`,
  `.product`, `[data-product-id]`, `.card--product`.
- `TITLE_SELECTORS` — `.product-item__title`, `.product-title`,
  `.card__heading a`, `.product-item-link`, `h2 a`, `h3 a`, `.title a`,
  `a.product-name`, `.name`.
- `PRICE_SELECTORS` — `.price--sale .money`, `.price .money`,
  `.price-item--sale`, `.price-item--regular`, `.price`, `.money`,
  `[class*="price"]`.
- `IMAGE_SELECTORS` — `img[data-src]`, `img[src*="cdn.shopify"]`,
  `img[src*="product"]`, `img.product-image`, `.product-image-photo`, `img`.
- `LINK_SELECTORS` — `a.product-item__link`, `a[href*="/products/"]`, `h2 a`,
  `h3 a`, `.card__heading a`, `a`.

`extractFromHtml(pageUrl, maxItems = 50, options = {})`:

1. `urlValidator` defaults to `(url) => url.includes('/products/')`.
2. `withRetry` + `safeGet(pageUrl, { responseType: 'text' })`.
3. Loads HTML into Cheerio.
4. Iterates each container selector. If it has fewer than 2 matches it skips
   (avoids picking up incidental matches like a single `.product` element).
5. For each container, runs `extractText` (title), `extractText` (price text),
   `parseHtmlPrice` (strip non-digits, cap 8 digits), `extractImage`
   (handles `//`, `data-src`, `srcset`, `{width}` placeholders), and
   `extractLink` (relative → absolute).
6. Pushes any product that passes validation (image present, valid product
   URL).
7. Stops at the first selector that yields at least one product.

Returns `{ products, strategy: 'html' | 'failed' }`.

### 13.5 Parser — `scripts/scrapers/parsers/productParser.js`

This is where raw scraper output becomes a database-ready Product document.

#### `OCCASION_MAP`, `STYLE_MAP`, `SUBCATEGORY_KEYWORDS`, `SEASON_MAP`

Pattern-based inference tables. For example:

- **Occasion** — `wedding/bridal/nikah/barat/valima` → `wedding`,
  `eid/festive/celebration` → `eid`, etc. `lawn/summer/pret` and
  `winter/khaddar/karandi/...` are also mapped to `casual`.
- **Style** — `embroidered/zardozi/gota/tilla/stone work` → `embroidered`;
  `chikankari/handwork` → `heavy`; `t-shirt/jeans/hoodie` → `western`.
- **SubCategory keywords** — only used as a fallback when the collection's
  `configDefault` is `'other'`. The comments emphasize: **`pret`/`unstitched`
  are NOT valid enum values** — don't add them.
- **Season** — `summer/lawn/cotton/voile/chiffon/georgette` → `summer`;
  `winter/khaddar/karandi/wool/velvet/fleece` → `winter`.

#### `normalizeProduct(raw, brandConfig)` — the big function

Returns a full Product object **or `null`** if validation fails. Fields:

1. `name` — `raw.title || raw.name` trimmed; rejects names shorter than 3 chars.
2. `price` — must be present and `> 0`.
3. `images` — uses `raw.images` array; prepends `raw.imageUrl` if not already
   included. Rejects if the result is empty.
4. `productUrl` — required; must start with `http`.
5. `stitching` — `subCategory.startsWith('unstitched') ? 'unstitched' : 'stitched'`.
6. `dressStyle` — `inferDressStyle(textBlob, subCategory)` using `DRESS_STYLE_MAP`
   keyword lookup → `saree|lehenga|frock|maxi|shalwar-kameez|kurta|co-ord|palazzo|western`.
7. `print` — `inferPrint(textBlob)` using keyword lists:
   - `EMBROIDERY_KEYWORDS` → `'embroidered'`
   - `PRINT_KEYWORDS` → `'printed'`
   - `PLAIN_KEYWORDS` → `'plain'`
   - else → `'embellished'`
8. `pieces` — regex parse of name/description: `"2 piece/do piece/2-piece"` → 2, `"3 piece/teen piece"` → 3, `"kurta/shirt"` alone → 1.
9. `primaryExactColor`, `exactColors` — from `inferColors().primaryExactColor / exactColors` (exact scraped shades).
10. `primaryColor`, `colors` — from `inferColors().primaryColor / colors` (canonical families, unchanged).
11. `occasion` — `dedupe([...configOccasion, ...inferOccasions(textBlob)])`.
12. `style` — `dedupe([...configStyle, ...inferStyles(textBlob)])`.
13. `subCategory` — config-level value wins unless `'other'`, then keyword inference.
14. `fabric` — first match from fabric keyword list (capitalized).
15. `metadataScore` — composite 0-1 score:
    - +0.20 for name
    - +0.20 for price > 0
    - +0.20 for images present
    - +0.10 if colors are not just `Multicolor`
    - +0.15 for any occasion
    - +0.10 for any style
    - +0.05 for description longer than 20 chars

12. **Stock check** — if `raw.isAvailable === false`, the function returns
    `null` so out-of-stock items aren't surfaced.

The returned object also carries `currency: 'PKR'`, `source = brandConfig.source ?? brand`, and the Shopify `handle` if known.

#### `validateProduct(product)`

Runs the final gate before insertion. Required fields:
`['name', 'price', 'productUrl', 'images']`. Also enforces `price > 0` and a
URL beginning with `http`. Returns `{ valid, reason }`.

#### Helpers

- `inferOccasions(textBlob)`, `inferStyles(textBlob)`, `inferSeason(textBlob)`,
  `inferFabric(textBlob)` — keyword scans returning arrays / scalars.
- `inferSubCategory(textBlob, configDefault)` — config-first.
- `computeMetadataScore` — described above.
- `dedupe(arr)` — `[...new Set(arr)]`.

### 13.6 Utilities — `scripts/scrapers/utils/`

#### `colorInference.js`

`COLOR_MAP` — ordered array of `{ keywords[], family, exact }` entries covering
Black, White, Red, Blue, Green, Yellow, Pink, Purple, Orange, Gold, Grey, Brown,
Teal, Multicolor. Keywords are sorted **longest-first** within each family to
prevent partial matches (e.g. "navy blue" matched before "blue").

`inferColors(text)` now returns **four fields** — both exact shades AND canonical families:

```js
{
  primaryColor:      "Red",              // canonical family (unchanged from old behaviour)
  colors:            ["Red", "Gold"],    // all canonical families
  primaryExactColor: "maroon",           // exact scraped shade (NEW)
  exactColors:       ["maroon", "golden"] // all exact shades (NEW)
}
```

Returns `{ Multicolor, [Multicolor], null, [] }` if no match. Deduplicates both arrays.

- `inferColor(text)` → legacy single-string helper returning canonical `primaryColor`.

#### `logger.js`

Lightweight JSON-line logger:

- Log directory: `backend/logs/scraper/` (auto-created).
- Filename: `<YYYY-MM-DD>.log`.
- Each line is `{ ts, level, message, meta? }` JSON.
- Console output is colored per level
  (`INFO=cyan`, `WARN=yellow`, `ERROR=red`, `SUCCESS=green`).
- Exports default `logger` with `.info / .warn / .error / .success`.
- File writes use `appendFileSync` and silently swallow errors so a failing
  disk doesn't break a scrape.

#### `requestUtils.js`

The polite-HTTP toolkit:

- **`USER_AGENTS`** — pool of 4 modern browser UAs.
- **`randomUserAgent()`** — random pick.
- **`defaultHeaders()`** — UA + standard `Accept` headers.
- **`jsonHeaders()`** — UA + `Accept: application/json`.
- **`delay(ms)`** — promisified `setTimeout`.
- **`politeSleep(baseMs)`** — `base ± 30 % jitter`, never below 500 ms;
  default base is `SCRAPER_DELAY_MS` env (1500 ms).
- **`withRetry(fn, retries, baseDelay)`** — exponential backoff
  (`baseDelay * 2^(attempt-1)`), default `SCRAPER_RETRY_LIMIT` env (3 attempts).
  Throws the **last** error if all attempts fail.
- **`createAxiosInstance(timeoutMs = 15000)`** — preconfigured axios with
  `defaultHeaders` and `maxRedirects: 5`.
- **`safeGet(url, { timeout = 15000, responseType = 'json', extraHeaders = {} })`** — uses the axios instance, merges `extraHeaders` (e.g. `Accept: application/json` for Shopify JSON), returns the full axios response.

### 13.7 Brand Configs — `scripts/scrapers/config/`

#### `clothingBrands.js`

`CLOTHING_BRANDS` — exported array of 5 brand objects. Each looks like:

```js
{
  brand: 'Beechtree',
  baseUrl: 'https://beechtree.pk',
  adapter: 'BeechtreeAdapter',
  category: 'clothing',
  collections: [
    { path: '/collections/2-piece',
      subCategory: '2-piece', occasion: ['casual','office'], style: ['printed','minimal'] },
    // ... ~14 more
  ]
}
```

The five brands and approximate collection counts (as configured today):

| Brand | Base URL | Collections |
| --- | --- | --- |
| Beechtree | https://beechtree.pk | 14 |
| Limelight | https://www.limelight.pk | 16 |
| Zellbury | https://zellbury.com | 17 |
| Alkaram Studio | https://www.alkaramstudio.com | 16 |
| Gul Ahmed | https://www.gulahmedshop.com | 15 |

Each entry pre-sets the `subCategory`, `occasion`, and `style` so the parser
doesn't need to infer them from text; inference fills in only the gaps.

#### `shoeBrands.js`

`SHOE_BRANDS` — 5 shoe brands:

| Brand | Base URL | Collections |
| --- | --- | --- |
| Stylo | https://stylo.pk | 6 (heels, flats, sandals, khussa, back-open, ethnic) |
| ECS | https://shopecs.com | 5 |
| Borjan | https://www.borjan.com.pk | 6 |
| Hush Puppies | https://www.hushpuppies.com.pk | 2 |
| Ndure | https://ndure.com | 6 |

The unified `subCategory` vocabulary for shoes is documented at the top of the
file: `heels`, `flats`, `sandals`, `khussa`, `sneakers`, `boots`, `mules`,
`other`.

### 13.8 Legacy `scripts/scrapers/scraper.js`

A single-file scraper implementing the same 3-strategy approach for **5
hard-coded brands** (Junaid Jamshed, Limelight, Zeen, Ethnic, Stylo). It is no
longer the canonical scraper, but its helpers are exported so
`scraper.test.js` can unit test:

- `inferColor(title)` — title-only color inference.
- `parseShopifyPriceToNumber(price)`.
- `normalizeUrlToAbsolute(url, baseOrigin)`.
- `buildShopifyCollectionProductsJsonUrl(collectionUrl, limit, page)`.
- `buildShopifyAllProductsJsonUrl(anyUrl, limit, page)`.
- `normalizeShopifyProduct(product, baseOrigin, brandName, category, occasionList, styleList)`.

It also exposes its own `runScraper()` which wipes the entire `Product`
collection and reseeds — destructive, so do **not** invoke it by accident in
production.

### 13.9 Tests — `scripts/scrapers/scraper.test.js`

Uses Node's built-in `node:test` runner. Coverage:

1. `inferColor` maps common color keywords (red, navy → Blue, emerald → Green,
   black → Black, ivory → White).
2. `buildShopifyCollectionProductsJsonUrl` produces the expected
   `/collections/<x>/products.json?limit=&page=` URL.
3. `buildShopifyAllProductsJsonUrl` produces `<origin>/products.json?limit=&page=`.
4. `normalizeShopifyProduct` returns a complete Product object with
   `brand`, `category`, integer price, absolute image URL, etc.
5. `normalizeShopifyProduct` returns `null` when a product is missing a price.

Run with `npm test`.

---

## 14. Standalone Scripts — `scripts/`

### 14.1 `scripts/clearDB.js`

A safe-ish reset utility. Connects to Mongo (env required), then iterates a
**fixed allowlist** of collection names and `deleteMany({})` each:

```js
const collections = ['products', 'scraperlogs', 'favorites', 'outfits'];
```

Logs counts and prints an `✨ Database is now completely fresh.` banner. Does
**not** touch the `users` collection, so you don't accidentally lock yourself
out.

Run with `node scripts/clearDB.js` from the `backend/` directory.

### 14.2 `scripts/testAIStylist.js`

End-to-end smoke test for the Master Stylist flow. Connects to Mongo, builds
a hard-coded intent (pink wedding dress under PKR 15 000), calls
`getOutfitForQuery(intent, ai)` and pretty-prints the hero pick, alternative
options, and recommended shoes. Useful when verifying a fresh DB seed.

Requires both `MONGO_URI` and `GEMINI_API_KEY`.

### 14.3 `scripts/testGemini.js`

Minimal Gemini connectivity check. Uses `gemini-2.5-flash` to parse a sample
fashion request and prints the JSON. Returns clear messages for missing or
invalid keys.

### 14.4 `backend/test_gemini.js`

A second, **stray** Gemini smoke test at the project's `backend/` root (note:
not under `scripts/`). It uses the **`@google/genai`** package (not
`@google/generative-ai`) and reads the key from `frontend/.env.local`. It is
not referenced by any npm script. Treat as historical and consider removing
or merging into `scripts/testGemini.js`.

### 14.5 `backend/test-output.txt`

A captured CLI log file (not application code). Safe to ignore or delete.

---

## 15. Cross-Cutting Concerns

### 15.1 Authentication

- JWTs are signed with `JWT_SECRET` and last **30 days**.
- Tokens are issued by `/api/auth/register` and `/api/auth/login`.
- Frontend must send `Authorization: Bearer <token>` on every protected route.
- The `protect` middleware loads the user fresh on every request — so removing
  a user immediately invalidates their requests, but credential changes only
  re-issue tokens via login.
- The first-ever registered user is silently promoted to **admin**.

### 15.2 Authorization

- `adminOnly` exists but is **not currently mounted** on `/api/admin/*` (per
  the in-code comment) so admin endpoints are unauthenticated in dev.
- Re-add `router.use(protect, adminOnly)` at the top of `routes/admin.js`
  before deploying.

### 15.3 Rate Limiting

| Limiter | Window | Limit | Scope |
| --- | --- | --- | --- |
| Global | 15 min | 300 req | All routes |
| Auth | 15 min | 20 req | `/api/auth/*` |

429 responses use a JSON `{ error }` body so the frontend can render them
cleanly.

### 15.4 Security Headers

`helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })` enables
all default headers (HSTS, noSniff, X-Frame-Options, etc.) but loosens CORP
so that scraped image URLs render in the React app.

### 15.5 Image Handling

- All uploads (`/api/search/visual/image`, `/api/wardrobe`) go through
  `multer.memoryStorage()` — **no disk persistence**.
- The image buffer is base64-encoded and posted directly to Gemini.
- `/api/wardrobe` currently saves a placeholder URL because no S3/Cloudinary
  integration exists yet.

### 15.6 Error Handling

- Each route wraps its handler in `try/catch` and returns a JSON `{ error }`
  with an appropriate status code.
- `server.js` registers a global Express error handler that logs the error
  and responds with `Internal server error` in production (or the raw message
  otherwise).
- The 404 handler returns the exact failed `METHOD /path`.

### 15.7 Logging

- API routes use `console.log` / `console.error`.
- The scraper uses the structured `utils/logger.js` which writes JSON-line
  files under `backend/logs/scraper/<date>.log` and prints colored output.
- `ScraperLog` documents serve as a queryable, persistent audit trail.

### 15.8 Concurrency Control for Scraping

- `routes/admin.js` keeps an `activeScrapePromise` singleton and rejects new
  manual triggers (`409`) while a `ScraperLog` document is in `running` status.
- The scraper itself is **not** safe to run multiple times in parallel because
  it uses `productUrl`-based upsert and would race the same documents.

---

## 16. End-to-End Data Flows

### 16.1 New User Sign-Up & Onboarding

```
Frontend → POST /api/auth/register { name, email, password }
         ↓
        User.create() → bcrypt hash via pre('save')
        First user becomes admin
         ↓
Returns { user, token }
         ↓
Frontend stores JWT in localStorage; subsequent calls send Authorization header
```

### 16.2 Browsing the Catalogue

```
Frontend → GET /api/products?category=clothing&color=Pink&page=1
         ↓
        Builds Mongo query, paginates, excludes embedding
         ↓
Returns { products, pagination }
```

### 16.3 Chat-Based Outfit Recommendation

```
Frontend → POST /api/recommendations/outfit { message: "Pink wedding dress under 15000 PKR" }
         ↓
        Gemini 2.5 Flash parses → { color, occasion[], style[], maxBudget }
         ↓
        getOutfitForQuery(intent, ai)
          ↓
          Mongo $sample 20 candidates (filtered by color/occasion/budget)
          ↓
          Gemini picks the Hero (selectedIndex + reasoning)
          ↓
          Score 40 candidate shoes against the hero (cosineSim/keyword + colorTheory + occasion + style)
          ↓
          Return top 6 shoes
         ↓
Returns { intent, outfit: { heroDress, otherDresses[6], shoes[6], reasoning, intent } }
```

### 16.4 Visual Search (Photo → Matched Products)

```
Frontend → POST /api/search/visual/image (multipart image)
         ↓
        Gemini 1.5 Flash analyzes the image → { category, color, style, keywords[] }
         ↓
        Mongo query: $or on primaryColor regex + name regex on first keyword
        + category coerced to 'shoes' or 'clothing'
         ↓
Returns { analysis, matches[≤10], message }
```

### 16.5 Daily Scrape

```
node-cron ("0 3 * * *", Asia/Karachi) → runScraper({ triggeredBy: 'cron' })
         ↓
        Create ScraperLog (status='running')
         ↓
        For each brand in CLOTHING_BRANDS + SHOE_BRANDS:
          For each collection in brand.collections:
            BaseAdapter.scrapeCollection
              Strategy 1: /collections/<x>/products.json (paginated)
              Strategy 2: /products.json + keyword filter
              Strategy 3: Cheerio HTML extraction
            normalizeProduct → validateProduct → Product.findOneAndUpdate (upsert by productUrl)
         ↓
        Update ScraperLog (status='completed', durationMs, stats, brandResults)
         ↓
        Logger writes summary banner; SSE clients (admin dashboard) get 'completed' event
```

### 16.6 Admin Manual Scrape with Live Progress

```
Admin → POST /api/admin/scraper/run
        ↓
        409 if a 'running' ScraperLog exists; otherwise immediate 200 + broadcast 'started'
        ↓
        runScraper({ triggeredBy: 'admin' }) executed in background
        ↓
        On success: broadcast 'completed' with stats
        On failure: broadcast 'error'

Admin → GET /api/admin/scraper/stream  (Server-Sent Events)
        ↓
        Receives connected/heartbeat/started/completed/error events in real time
```

---

## 17. API Quick-Reference Table

> All paths are prefixed with `/api`. **A** = requires `protect` middleware.
> Admin endpoints currently require **no auth** in dev (see section 10.6).

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Liveness probe |
| `POST` | `/auth/register` | — | Create account, get JWT (first user → admin) |
| `POST` | `/auth/login` | — | Email + password → JWT |
| `GET` | `/auth/me` | A | Current user |
| `GET` | `/products` | — | Paginated browse with filters |
| `GET` | `/products/featured` | — | 6 random clothing + 4 random shoes |
| `GET` | `/products/stats` | — | Totals, by-category, top brands, price range |
| `GET` | `/products/:id` | — | Single product |
| `POST` | `/recommendations/outfit` | — | Chat → AI Master Stylist outfit |
| `GET` | `/recommendations/:productId` | — | Static "shop the look" |
| `GET` | `/search` | — | Text + filter search (text index, regex fallback) |
| `GET` | `/search/suggestions` | — | Autocomplete (limit 8) |
| `POST` | `/search/visual/image` | — | Upload photo → Gemini → matches |
| `GET` | `/favorites` | A | List user's favorites (populated) |
| `POST` | `/favorites/:productId` | A | Toggle favorite |
| `DELETE` | `/favorites/:productId` | A | Remove favorite (idempotent) |
| `GET` | `/favorites/check/:productId` | A | Boolean check |
| `POST` | `/outfits` | A | Save curated outfit (hero + accessories) |
| `GET` | `/outfits` | A | List user's saved outfits |
| `DELETE` | `/outfits/:id` | A | Delete saved outfit |
| `POST` | `/wardrobe` | A | Upload clothing photo → AI tag → save |
| `GET` | `/wardrobe` | A | List user's wardrobe items |
| `GET` | `/admin/stats` | (admin*) | Catalogue + price stats for dashboard |
| `GET` | `/admin/scraper/logs?limit=20` | (admin*) | Recent scraper run logs |
| `GET` | `/admin/scraper/status` | (admin*) | `{ isRunning, latest }` |
| `GET` | `/admin/scraper/stream` | (admin*) | SSE for live scraper progress |
| `POST` | `/admin/scraper/run` | (admin*) | Trigger manual scrape (409 if running) |
| `DELETE` | `/admin/products/brand/:brand` | (admin*) | Bulk-delete a brand's products |

`(admin*)` = should require `protect, adminOnly` in production; currently
**unauthenticated** per the in-code comment.

---

### Final Notes

- This document is generated from the actual code at the time of writing —
  every behavior described above can be traced to a specific file and line.
- When you add a route, model, adapter, or service, please add it here so this
  remains the canonical backend reference.
- For the "why" behind product decisions (e.g. why we use a join `Favorite`
  collection instead of just `User.favoriteProducts`), see the inline comments
  in each model and the `PROJECT_REPORT.md` at the repo root.
