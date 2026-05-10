# AuraFit — AI-Powered Pakistani Fashion Platform

> A production-grade, full-stack fashion discovery and outfit recommendation platform built for the Pakistani market. AuraFit aggregates real product data from 10 leading Pakistani fashion brands and uses a progressive constraint relaxation engine backed by Gemini AI to generate intelligent, ranked outfit recommendations.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Database Models](#database-models)
- [API Reference](#api-reference)
- [Scraper Pipeline](#scraper-pipeline)
- [AI Recommendation Engine](#ai-recommendation-engine)
- [Color Theory Engine](#color-theory-engine)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Admin Dashboard](#admin-dashboard)
- [Scripts Reference](#scripts-reference)

---

## Overview

AuraFit solves a real market gap: Pakistani fashion shoppers have no single intelligent platform that aggregates products across the country's top brands and recommends complete, styled outfits.

The platform automatically scrapes **10 top Pakistani brands** on a weekly schedule, normalizes all product data into a unified schema (including exact color shades, dress style, stitching type, piece count, and print type), and uses a **progressive constraint relaxation engine** backed by **Gemini 2.5 Flash AI** to recommend ranked outfits from a single natural-language query — with per-product AI match reasons and one paired shoe per result.

---

## Features

### Intelligent Scraper Pipeline
- Scrapes **10 leading Pakistani brands**: Beechtree, Limelight, Zellbury, Alkaram, Gul Ahmed, Stylo, ECS, Borjan, Hush Puppies, and Ndure
- **3-Strategy Waterfall Extraction**:
  1. **Shopify JSON API** — fastest, most structured (`/products.json`)
  2. **Site-wide product listing** — fallback for non-standard Shopify
  3. **Cheerio HTML parsing** — deepest fallback for any site structure
- **Rich attribute extraction** per product: exact color shades, canonical color family, dress style (lehenga/saree/frock/kurta etc.), stitching (stitched/unstitched), print type (embroidered/printed/plain/embellished), piece count
- **Dual color storage**: `primaryExactColor`/`exactColors` (exact scraped shade) + `primaryColor`/`colors` (canonical family) stored in parallel
- **Auto-Scheduler** — `node-cron` job runs every Sunday at 3:00 AM PKT
- **Dry-run mode** — parse without writing to DB
- **Full audit logs** — every scrape run logged with per-brand stats

### Progressive Constraint Relaxation Engine
- Replaces weighted numeric scoring with a DB-level constraint relaxation approach
- User-specified fields become exact DB filters; unspecified fields are never filtered
- Relaxation order (one constraint dropped per level): `occasion → print → dressStyle → stitching → pieces → fabric → exact color → canonical family`
- Stops as soon as ≥ 50 candidates are found; returns all dropped constraints as a `relaxationMessage`
- **Only filters on what the user mentioned** — if no stitching specified, all stitching types are included

### Gemini AI Ranking (top-50 → top-10)
- Top 50 candidates from the relaxation engine are sent to **Gemini 2.5 Flash** for intelligent ranking
- Gemini reads each product's full description and all metadata, then returns:
  - Ranked order (best to worst match)
  - A one-sentence match reason per product
- Top 10 returned with `rank`, `matchReason`, and one paired shoe each
- **Multi-provider AI fallback**: Gemini 2.5 → Groq (Llama 3.1) → OpenRouter (Gemma 2) → Gemini 1.5

### AI Style Chat ("Style Me")
- Type natural language: *"I want an unstitched maroon 3-piece embroidered for wedding"*
- Gemini parses full intent: `colorExact`, `colorFamily`, `dressStyle`, `print`, `stitching`, `pieces`, `fabric`, `occasion[]`, `maxBudget`, `intentSummary`, `aiAnalysis`
- Returns top 10 ranked clothing results + one shoe per result with match reasons
- Relaxation message shown when constraints had to be loosened

### Discovery & Search
- **Advanced filters**: category, brand, color, occasion, price range
- **Semantic search**: MongoDB `$text` index with score-based ranking + regex fallback
- **Auto-complete suggestions** — top 5 matches as you type
- **URL-driven state** — all filters reflected in query params (shareable links)
- **Pagination** — 24 products/page, configurable up to 48

### User System
- JWT authentication (30-day tokens)
- Personal favorites — toggle-save any product
- User preferences — occasions, styles, colors, budget
- Admin seeder script for secure initial access

### Admin Dashboard
- Real-time scraper status and live logs stream (via Server-Sent Events)
- Manual scrape trigger (runs async)
- Full scrape history with per-brand breakdown
- Product stats by category, brand, and 7-day growth
- Delete all products for a specific brand

### Premium UI
- **Next.js 16** App Router + TypeScript + React 19
- **Editorial Fashion Design System** — refined charcoal and gold aesthetic
- **Floating AI ChatWidget** — side-panel with RAG outfit recommendations, compact product cards with category chips and match reasons
- **Virtual Try-On** — Replicate IDM-VTON integration
- **Wardrobe Manager** — upload clothes, Gemini auto-tags
- **Outfit Boards** — save AI-generated combinations
- **Visual Search** — upload inspiration photo, Gemini analyzes and finds similar products
- Responsive — mobile-first with slide-out menu

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Vanilla CSS — custom Editorial Fashion design system |
| HTTP Client | Axios with JWT interceptors |
| Backend | Node.js, Express 4 (ES Modules) |
| Database | MongoDB via Mongoose 8 |
| Authentication | JWT (jsonwebtoken), bcryptjs |
| AI — Primary | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| AI — Fallback 1 | Groq (Llama 3.1 8B Instant) |
| AI — Fallback 2 | OpenRouter (Gemma 2 9B) |
| AI — Fallback 3 | Google Gemini 1.5 Flash |
| Vector Embeddings | HuggingFace `all-MiniLM-L6-v2` (free inference API) |
| Virtual Try-On | Replicate `IDM-VTON` model |
| Web Scraping | Axios (HTTP), Cheerio (HTML parsing) |
| Scheduling | node-cron |
| Logging | Winston |
| Security | Helmet, CORS, express-rate-limit |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│   Home  |  Discover  |  Search  |  Product  |  Admin        │
└──────────────────────────┬──────────────────────────────────┘
                           │ Axios (JWT Bearer)
┌──────────────────────────▼──────────────────────────────────┐
│                    Express API Server                        │
│  /api/auth  /api/products  /api/recommendations             │
│  /api/search  /api/favorites  /api/admin                    │
│                                                             │
│  Middleware: Helmet → CORS → Rate Limit → JWT Auth          │
│                                                             │
│  Routes (thin) → Controllers (logic) → Services             │
└────────┬────────────────────────────┬────────────────────────┘
         │                            │
┌────────▼────────┐        ┌──────────▼──────────────────────┐
│  Services Layer │        │       Scraper Pipeline          │
│  ─────────────  │        │  10 Brand Adapters              │
│  Recommendation │        │  3-Strategy Extraction          │
│  Engine (relax) │        │  Product Normalizer             │
│  Color Theory   │        │  node-cron Scheduler            │
│  Gemini AI      │        └──────────┬──────────────────────┘
│  (rank top-50)  │                   │
│  AI Fallback    │                   │
└────────┬────────┘                   │
         │                            │
┌────────▼────────────────────────────▼────────────────────────┐
│                   MongoDB Atlas                               │
│   users | products | outfits | favorites | scraperlogs        │
└───────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│              Multi-Provider AI Fallback Chain               │
│  Gemini 2.5 Flash → Groq Llama 3.1 → OpenRouter Gemma 2    │
│  → Gemini 1.5 Flash                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
AuraFit/
├── backend/
│   ├── config/
│   │   └── db.js                    # MongoDB connection
│   ├── middleware/
│   │   └── auth.js                  # JWT verification + role guard
│   ├── models/
│   │   ├── User.js                  # Auth + preferences schema
│   │   ├── Product.js               # Unified product schema (all categories)
│   │   ├── Outfit.js                # AI-generated outfit combinations
│   │   ├── Favorite.js              # User-product join table
│   │   └── ScraperLog.js            # Scrape run audit log
│   ├── controllers/
│   │   ├── recommendationsController.js  # Intent parsing + outfit generation
│   │   ├── productsController.js         # Product CRUD handlers
│   │   ├── authController.js             # Login / register handlers
│   │   ├── searchController.js           # Search handlers
│   │   ├── favoritesController.js        # Favorites handlers
│   │   └── adminController.js            # Admin + scraper handlers
│   ├── routes/
│   │   ├── auth.js                  # → authController
│   │   ├── products.js              # → productsController
│   │   ├── recommendations.js       # → recommendationsController
│   │   ├── search.js                # → searchController
│   │   ├── favorites.js             # → favoritesController
│   │   └── admin.js                 # → adminController
│   ├── services/
│   │   ├── recommendationEngine.js  # Progressive relaxation + shoe matching
│   │   ├── aiService.js             # Gemini ranking + multi-provider intent parsing
│   │   └── colorTheory.js           # 15-color compatibility matrix
│   ├── jobs/
│   │   └── scraperJob.js            # node-cron weekly scheduler
│   ├── scripts/scrapers/
│   │   ├── index.js                 # Orchestrator (runs all brands)
│   │   ├── scraper.js               # Core scraping logic
│   │   ├── adapters/                # Brand-specific configurations
│   │   │   ├── BaseAdapter.js
│   │   │   ├── ZellburryAdapter.js
│   │   │   ├── BeechtreeAdapter.js
│   │   │   ├── LimelightAdapter.js
│   │   │   ├── AlkaramAdapter.js
│   │   │   ├── GulAhmedAdapter.js
│   │   │   ├── StyloAdapter.js
│   │   │   ├── ECSAdapter.js
│   │   │   ├── BorjanAdapter.js
│   │   │   ├── HushPuppiesAdapter.js
│   │   │   └── NdureAdapter.js
│   │   ├── extractors/
│   │   │   ├── shopifyExtractor.js  # Shopify JSON API strategy
│   │   │   └── htmlExtractor.js     # Cheerio HTML strategy
│   │   ├── parsers/
│   │   │   └── productParser.js     # Normalize raw data → Product schema
│   │   └── utils/
│   │       ├── colorInference.js    # Returns exact + canonical colors
│   │       ├── requestUtils.js      # Axios + exponential backoff
│   │       └── logger.js            # Winston structured logging
│   ├── server.js                    # Express app bootstrap
│   └── .env
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx           # Root layout with Navbar
    │   │   ├── page.tsx             # Home — hero + AI chat + featured
    │   │   ├── discover/page.tsx    # Product browser with filters
    │   │   ├── search/page.tsx      # Full-text search
    │   │   ├── product/[id]/page.tsx# Product detail + recommendations
    │   │   ├── favorites/page.tsx   # User saved items
    │   │   ├── admin/page.tsx       # Admin dashboard
    │   │   └── globals.css          # Editorial Fashion design tokens
    │   ├── components/
    │   │   ├── Navbar.tsx           # Top navigation
    │   │   ├── ProductCard.tsx      # Reusable product card
    │   │   ├── ChatWidget.tsx       # Floating AI chat side-panel
    │   │   └── RecommendationResult.tsx  # Outfit result display (compact + full)
    │   ├── context/
    │   │   └── AuthContext.tsx      # Global auth state
    │   └── lib/
    │       └── api.ts               # Axios client + typed API helpers
    └── package.json
```

---

## Database Models

### Product
The unified schema for all items — clothing, shoes, and accessories.

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Product name |
| `brand` | String | Brand name |
| `category` | String | `clothing` \| `shoes` \| `accessories` |
| `subCategory` | String | e.g., `stitched`, `unstitched`, `heels` |
| `dressStyle` | String | `saree` \| `lehenga` \| `frock` \| `maxi` \| `shalwar-kameez` \| `kurta` \| `co-ord` \| `palazzo` \| `western` |
| `stitching` | String | `stitched` \| `unstitched` |
| `print` | String | `embroidered` \| `printed` \| `plain` \| `embellished` \| `mixed` |
| `pieces` | Number | Piece count: `1`, `2`, or `3` |
| `fabric` | String | e.g., `lawn`, `chiffon`, `silk`, `velvet` |
| `occasion` | [String] | e.g., `wedding`, `eid`, `casual`, `formal` |
| `style` | [String] | e.g., `elegant`, `embroidered`, `traditional` |
| `primaryExactColor` | String | Exact scraped shade, e.g., `"maroon"` |
| `exactColors` | [String] | All exact scraped shades, e.g., `["maroon", "golden"]` |
| `primaryColor` | String | Canonical color family, e.g., `"Red"` |
| `colors` | [String] | All canonical families, e.g., `["Red", "Gold"]` |
| `price` | Number | Price in PKR |
| `compareAtPrice` | Number | Original price (sale items) |
| `productUrl` | String | Unique source URL |
| `imageUrl` | String | Primary image |
| `images` | [String] | All image URLs |
| `description` | String | Full product description |
| `embedding` | [Number] | Semantic vector (HuggingFace) |

**Indexes:** `brand+category`, `primaryColor+category`, `stitching+category`, `print+category`, `dressStyle+category`, `occasion`, `price`, full-text on `name+description+tags`

### User

| Field | Type | Description |
|-------|------|-------------|
| `email` | String | Unique, lowercase |
| `password` | String | bcrypt hashed |
| `role` | String | `user` \| `admin` |
| `preferences` | Object | `{ occasions, styles, favoriteColors, budget }` |

### ScraperLog

| Field | Type | Description |
|-------|------|-------------|
| `runId` | String | Unique ISO timestamp |
| `status` | String | `running` \| `completed` \| `failed` \| `partial` |
| `triggeredBy` | String | `cron` \| `admin` \| `manual` |
| `stats` | Object | `{ totalInserted, totalUpdated, totalSkipped, totalFailed }` |
| `brandResults` | [Object] | Per-brand breakdown with strategy used |
| `durationMs` | Number | Total run time |

---

## API Reference

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | — | Create account; first user becomes admin |
| POST | `/login` | — | Returns JWT token (30-day expiry) |
| GET | `/me` | JWT | Current user profile |

### Products — `/api/products`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | — | Paginated list with filters |
| GET | `/featured` | — | 10 random products |
| GET | `/stats` | — | Counts by category/brand, price range |
| GET | `/:id` | — | Single product details |

**Filter query params:** `category`, `brand`, `color`, `occasion`, `minPrice`, `maxPrice`, `search`, `page`, `limit`, `sort`

### Recommendations — `/api/recommendations`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/:productId` | — | Product-page outfit suggestions |
| POST | `/outfit` | — | Chat-based outfit generation ("Style Me") |

**POST `/outfit` request:**
```json
{ "message": "I want an unstitched maroon 3-piece embroidered suit for wedding" }
```

**POST `/outfit` response:**
```json
{
  "intent": {
    "colorExact": "maroon",
    "colorFamily": "Red",
    "occasion": ["wedding"],
    "dressStyle": null,
    "stitching": "unstitched",
    "pieces": 3,
    "print": "embroidered",
    "fabric": null,
    "maxBudget": 0,
    "intentSummary": "An unstitched maroon 3-piece embroidered suit for weddings.",
    "aiAnalysis": "Maroon is a timeless wedding color in Pakistan..."
  },
  "results": [
    {
      "product": { "_id": "...", "name": "...", "brand": "...", "price": 6500,
                   "primaryExactColor": "maroon", "primaryColor": "Red",
                   "dressStyle": "shalwar-kameez", "stitching": "unstitched",
                   "print": "embroidered", "pieces": 3, "occasion": ["wedding"], ... },
      "rank": 1,
      "matchReason": "Exact maroon unstitched 3-piece with heavy embroidery, ideal for weddings.",
      "shoe": {
        "product": { "_id": "...", "name": "...", "price": 4200, ... },
        "score": 0.87,
        "reason": "tonal gold pairs with maroon · both wedding appropriate"
      }
    }
  ],
  "matchQuality": { "tier": "exact", "totalFound": 12, "message": null },
  "relaxationMessage": null
}
```

**Match quality tiers:** `exact` (no relaxation) → `close` (≥8 results) → `similar` (≥4) → `loose`

### Search — `/api/search`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | — | Full-text search with pagination |
| GET | `/suggestions` | — | Top 5 autocomplete matches |

### Favorites — `/api/favorites`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | JWT | User's saved products |
| POST | `/:productId` | JWT | Toggle favorite |
| GET | `/check/:productId` | JWT | `{ isFavorited: boolean }` |
| DELETE | `/:productId` | JWT | Remove favorite |

### Admin — `/api/admin`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/stats` | Admin | Totals, brand breakdown, 7-day growth |
| GET | `/scraper/logs` | Admin | Last 20 scrape run logs |
| GET | `/scraper/status` | Admin | Is scraper currently running? |
| POST | `/scraper/run` | Admin | Trigger async scrape |
| DELETE | `/products/brand/:brand` | Admin | Delete all products for a brand |
| PUT | `/auth/change-password` | Admin | Change admin password |

---

## Scraper Pipeline

### Extraction Strategy (Waterfall)

```
Brand URL
    │
    ├─► Strategy 1: GET /products.json?limit=250&page=N   (Shopify API)
    │       ✓ Fastest and most reliable
    │       ✗ Only works for Shopify stores
    │
    ├─► Strategy 2: Site-wide product listing crawl
    │       Fallback for non-standard Shopify setups
    │
    └─► Strategy 3: Cheerio HTML parsing
            Parse product cards from raw HTML
```

### Product Normalization (`productParser.js`)

Every raw scraped item is normalized:

1. Infer `category` from URL / name patterns
2. Infer `stitching` — `subCategory.startsWith('unstitched') ? 'unstitched' : 'stitched'`
3. Infer `dressStyle` — keyword lookup against `DRESS_STYLE_MAP` (saree, lehenga, frock, maxi, shalwar-kameez, kurta, co-ord, palazzo, western)
4. Infer `print` — `EMBROIDERY_KEYWORDS` → `embroidered`, `PRINT_KEYWORDS` → `printed`, `PLAIN_KEYWORDS` → `plain`, else `embellished`
5. Infer `pieces` — parse "2 piece / 3 piece / teen piece / do piece" from name/description
6. Run `inferColors()` → returns `{ primaryColor, colors, primaryExactColor, exactColors }` — both exact shades AND canonical families stored separately
7. Upsert to MongoDB using `productUrl` as unique key

### Color Storage (dual-field)

```
Name: "Maroon Embroidered 3-Piece Suit"
                ↓ inferColors()
primaryExactColor: "maroon"           ← exact scraped shade (new)
exactColors:       ["maroon"]         ← all exact shades (new)
primaryColor:      "Red"              ← canonical family (unchanged)
colors:            ["Red"]            ← all canonical families (unchanged)
```

### Covered Brands

| # | Brand | Category | Strategy |
|---|-------|----------|----------|
| 1 | Zellburry | Clothing | Shopify JSON |
| 2 | Beechtree | Clothing | Shopify JSON |
| 3 | Limelight | Clothing | Shopify JSON |
| 4 | Alkaram | Clothing | Shopify JSON |
| 5 | Gul Ahmed | Clothing | Shopify JSON |
| 6 | Stylo | Shoes | HTML / Shopify |
| 7 | ECS | Shoes | Shopify JSON |
| 8 | Borjan | Shoes | Shopify JSON |
| 9 | Hush Puppies | Shoes | HTML |
| 10 | Ndure | Shoes | Shopify JSON |

---

## AI Recommendation Engine

### Style Me — End-to-End Flow

```
User message
    │
    ▼
Intent Parsing (Gemini 2.5 Flash / fallback chain)
    │  extracts: colorExact, colorFamily, dressStyle, stitching,
    │            pieces, print, fabric, occasion[], maxBudget
    ▼
Progressive Constraint Relaxation
    │  Level 0: all specified constraints + exact color
    │  Level 1: drop occasion
    │  Level 2: drop print
    │  Level 3: drop dressStyle
    │  Level 4: drop stitching
    │  Level 5: drop pieces
    │  Level 6: drop fabric
    │  Level 7: exact → canonical color family
    │  Level 8: drop color entirely
    │  → stops at first level with ≥50 results
    ▼
Gemini AI Ranking (top 50 → top 10)
    │  sends all product metadata + descriptions to Gemini
    │  Gemini returns: ranked order + one match reason per product
    ▼
Shoe Matching (one per dress)
    │  scoreProduct(dress, shoe) = embedding×0.5 + color×0.2 + occasion×0.2 + style×0.1
    │  returns best shoe + generated reason string
    ▼
Response: results[10] each with { product, rank, matchReason, shoe }
```

### Multi-Provider AI Fallback

| Priority | Provider | Model |
|----------|----------|-------|
| 1 (primary) | Google Gemini | gemini-2.5-flash |
| 2 (fallback) | Groq | llama-3.1-8b-instant |
| 3 (fallback) | OpenRouter | gemma-2-9b-it:free |
| 4 (final) | Google Gemini | gemini-1.5-flash |

### Shoe Scoring Formula (product-to-product)

```
score = (embeddingSimilarity × 0.50)
      + (colorCompatibility  × 0.20)
      + (occasionMatch       × 0.20)
      + (styleMatch          × 0.10)
```

---

## Color Theory Engine

A handcrafted 15×15 fashion color compatibility matrix (`colorTheory.js`).

**15 canonical colors:** Black, White, Grey, Red, Pink, Purple, Blue, Green, Teal, Yellow, Orange, Gold, Beige, Brown, Multicolor

**Color alias resolution** — 180+ aliases mapped to canonical names including Pakistani Urdu transliterations:
- `ferozi/firozi` → Teal, `jamuni/baingan` → Purple, `gulabi` → Pink
- `mehroon/surkh/laal` → Red, `nila` → Blue, `narangi` → Orange
- `zard/peela` → Yellow, `safed` → White, `dhani/mehendi/sabz` → Green

**Exact color matching** — if user says "maroon", the engine first tries to match `exactColors` in the DB before falling back to the `Red` canonical family.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `PORT` | No | Express server port (default `5000`) |
| `FRONTEND_URL` | Yes | CORS allowed origin |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GROQ_API_KEY` | No | Groq API key (fallback AI) |
| `OPENROUTER_API_KEY` | No | OpenRouter API key (fallback AI) |
| `REPLICATE_API_KEY` | No | Replicate token for virtual try-on |
| `HUGGINGFACE_API_KEY` | No | HuggingFace token for vector search |
| `SCRAPER_DRY_RUN` | No | `true` = no DB writes |
| `SCRAPER_MAX_PER_BRAND` | No | Max products per brand (default `50`) |
| `SCRAPER_DELAY_MS` | No | Request delay ms (default `1500`) |
| `SCRAPER_RETRY_LIMIT` | No | Max retries (default `3`) |
| `ADMIN_EMAIL` | Yes | Admin seeder email |
| `ADMIN_PASSWORD` | Yes | Admin seeder password |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL |

---

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB (local) or MongoDB Atlas
- Google Cloud project with Gemini API enabled

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cd backend
cp .env.example .env
# Fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY, FRONTEND_URL
# Optionally add GROQ_API_KEY and OPENROUTER_API_KEY for AI fallback
```

```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:5000/api" > .env.local
```

### 3. Start backend

```bash
cd backend && npm run dev
# API running at http://localhost:5000
```

### 4. Start frontend

```bash
cd frontend && npm run dev
# App running at http://localhost:3000
```

### 5. Seed admin account

```bash
cd backend && npm run seed:admin
```

### 6. Populate the database

```bash
cd backend
npm run scrape        # Live scrape — writes to DB
npm run scrape:dry    # Dry run — no DB writes
```

---

## Admin Dashboard

Access at `/admin` after logging in with an admin account.

- Total products in DB by brand and category
- 7-day product growth stats
- Last 20 scraper run logs with per-brand breakdown
- Live scraper status + manual trigger
- Delete all products for a specific brand

---

## Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| Start production | `npm start` | `node server.js` |
| Start dev | `npm run dev` | `nodemon server.js` |
| Run scraper | `npm run scrape` | Full scrape, write to DB |
| Dry-run scraper | `npm run scrape:dry` | Parse only, no DB writes |
| Seed Admin | `npm run seed:admin` | Create admin from .env |

---

*Built for the Pakistani Fashion Community*
