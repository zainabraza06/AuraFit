# AuraFit — AI-Powered Pakistani Fashion Platform

> A production-grade, full-stack fashion discovery and outfit recommendation platform built exclusively for the Pakistani market. AuraFit aggregates real-time product data from 10 leading Pakistani fashion brands and uses AI to generate intelligent, color-coordinated outfit recommendations.

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

The platform automatically scrapes **10 top Pakistani brands** on a weekly schedule, normalizes all product data into a unified schema, and uses a multi-factor AI scoring system to recommend complementary items — giving users complete outfit suggestions from a single search or chat query.

---

## Features

### Intelligent Scraper Pipeline
- Scrapes **10 leading Pakistani brands**: Beechtree, Limelight, Zellbury, Alkaram, Gul Ahmed, Stylo, ECS, Borjan, Hush Puppies, and Ndure
- **3-Strategy Waterfall Extraction**:
  1. **Shopify JSON API** — fastest, most structured (`/products.json`)
  2. **Site-wide product listing** — fallback for non-standard Shopify
  3. **Cheerio HTML parsing** — deepest fallback for any site structure
- **Auto-Scheduler** — `node-cron` job runs every Sunday at 3:00 AM PKT
- **Dry-run mode** — parse without writing to DB (safe for testing)
- **Configurable limits** — max products per brand, request delays, retry count
- **Full audit logs** — every scrape run logged with per-brand stats

### AI Recommendation Engine
- **Two scoring systems:**
  - **Product-to-product** (product detail page): `embedding×0.5 + color×0.2 + occasion×0.2 + style×0.1`
  - **Intent-to-product** (AI chat): `colorMatch×0.45 + occasion×0.25 + style×0.15 + keywords×0.15`
- **Semantic embeddings** — cosine similarity between Gemini-generated product vectors
- **Color theory matrix** — 15-color fashion compatibility lookup (e.g., Black + Gold = 1.0)
- **Occasion matching** — Jaccard overlap between occasion arrays
- **Style matching** — Jaccard overlap between style arrays
- **Gemini intent parsing** — natural language chat queries parsed to structured JSON with canonical color + raw shade

### AI Style Chat
- Type natural language: *"I want a ferozi lawn suit for Eid"*
- Gemini 2.5 Flash extracts: `{ color: "Teal", shade: "ferozi", occasion, style, maxBudget, intentSummary, aiAnalysis }`
- Three-tier color scoring: exact shade match (1.0) → canonical alias match (0.82) → wrong color (0.08)
- Fetches 300 products, scores all without DB-level color filter — correct colors always rank first
- Returns top 10 clothing (hero + 9 others) + top 6 matching shoes
- Each result shows score breakdown bars, AI analysis card, and "Shop This Look" CTA

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
- Public registration disabled for production security
- Admin seeder script to initialize secure admin access

### Admin Dashboard
- Real-time scraper status and live logs stream (via Server-Sent Events / SSE)
- Manual scrape trigger (runs async, non-blocking)
- Full scrape history with per-brand breakdown
- Product stats by category, brand, and 7-day growth
- Change Password modal for secure credentials management
- Delete all products for a specific brand

### Premium UI
- **Next.js 16** with App Router and TypeScript
- **Editorial Fashion Design System** — refined charcoal and gold aesthetic, solid surfaces, no glassmorphism
- **Floating AI ChatWidget** — side-panel messaging UI with RAG outfit recommendations, toast notifications, and compact product cards
- **Virtual Try-On** — two-panel before/after with Replicate IDM-VTON integration and step progress
- **Wardrobe Manager** — upload clothes, Gemini auto-tags category/color/style, filter by type
- **Outfit Boards** — save and manage AI-generated outfit combinations
- **Semantic Search** — Keyword/AI toggle; semantic mode uses HuggingFace cosine similarity with % match badges
- **Visual Search** — upload inspiration photo, Gemini analyzes and finds similar products
- Responsive — mobile-first with slide-out menu and AI Tools dropdown

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Vanilla CSS — custom Editorial Fashion design system |
| HTTP Client | Axios with interceptors |
| Backend | Node.js, Express 4 (ES Modules) |
| Database | MongoDB via Mongoose 8 |
| Authentication | JWT (jsonwebtoken), bcryptjs |
| AI / NLP | Google Gemini 2.5 Flash (`@google/generative-ai`) |
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
└────────┬────────────────────────────┬────────────────────────┘
         │                            │
┌────────▼────────┐        ┌──────────▼──────────────────────┐
│  Services Layer │        │       Scraper Pipeline          │
│  ─────────────  │        │  10 Brand Adapters              │
│  Recommendation │        │  3-Strategy Extraction          │
│  Color Theory   │        │  Product Normalizer             │
│  Gemini AI      │        │  node-cron Scheduler            │
└────────┬────────┘        └──────────┬──────────────────────┘
         │                            │
┌────────▼────────────────────────────▼────────────────────────┐
│                   MongoDB Atlas                               │
│   users | products | outfits | favorites | scraperlogs        │
└───────────────────────────────────────────────────────────────┘
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
│   ├── routes/
│   │   ├── auth.js                  # Register / login / me
│   │   ├── products.js              # Browse, filter, paginate
│   │   ├── recommendations.js       # AI outfit generation
│   │   ├── search.js                # Full-text + semantic search
│   │   ├── favorites.js             # User favorites CRUD
│   │   └── admin.js                 # Dashboard + scraper control
│   ├── services/
│   │   ├── recommendationEngine.js  # Weighted scoring engine
│   │   └── colorTheory.js           # 14-color compatibility matrix
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
│   │   │   └── productParser.js     # Normalize → Product schema
│   │   ├── utils/
│   │   │   ├── colorInference.js    # Auto-detect color from image/name
│   │   │   ├── requestUtils.js      # Axios + exponential backoff
│   │   │   └── logger.js            # Winston structured logging
│   │   └── config/
│   │       ├── clothingBrands.js    # Clothing brand URLs
│   │       └── shoeBrands.js        # Shoe brand URLs
│   ├── server.js                    # Express app bootstrap
│   ├── .env                         # Environment variables (do not commit)
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx           # Root layout with Navbar
    │   │   ├── page.tsx             # Home — hero + chat + featured
    │   │   ├── discover/page.tsx    # Product browser with filters
    │   │   ├── search/page.tsx      # Full-text search
    │   │   ├── product/[id]/page.tsx# Product detail + recommendations
    │   │   ├── favorites/page.tsx   # User saved items
    │   │   ├── login/page.tsx       # Login form
    │   │   ├── register/page.tsx    # Registration form
    │   │   ├── admin/page.tsx       # Admin dashboard
    │   │   ├── categories/page.tsx  # Category browser
    │   │   └── globals.css          # Editorial Fashion design system
    │   ├── components/
    │   │   ├── Navbar.tsx           # Top navigation
    │   │   ├── ProductCard.tsx      # Reusable product card
    │   │   ├── ChatWidget.tsx       # Floating AI chat side-panel
    │   │   └── RecommendationResult.tsx # Outfit result display
    │   ├── context/
    │   │   └── AuthContext.tsx      # Global auth state
    │   └── lib/
    │       └── api.ts               # Axios client + typed API helpers
    ├── next.config.ts
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
| `subCategory` | String | e.g., `2-piece`, `pret`, `heels`, `jewelry` |
| `style` | [String] | e.g., `elegant`, `embroidered`, `traditional` |
| `occasion` | [String] | e.g., `wedding`, `eid`, `casual`, `office` |
| `colors` | [String] | All detected colors |
| `primaryColor` | String | Dominant color (used in matching) |
| `price` | Number | Price in PKR |
| `compareAtPrice` | Number | Original price (sale items) |
| `productUrl` | String | Unique source URL (unique index) |
| `embedding` | [Number] | Gemini semantic vector |
| `metadataScore` | Number | Data completeness 0–1 |
| `images` | [String] | Image URL array |

**Indexes:** `brand+category`, `primaryColor+category`, `occasion`, `price`, `tags`, full-text on `name+description+tags`

### User

| Field | Type | Description |
|-------|------|-------------|
| `email` | String | Unique, lowercase |
| `password` | String | bcrypt hashed |
| `role` | String | `user` \| `admin` |
| `preferences` | Object | `{ occasions, styles, favoriteColors, budget }` |

### Outfit
Stores AI-generated clothing + shoes combinations with full score breakdown.

| Field | Type | Description |
|-------|------|-------------|
| `clothing` | ObjectId | Product ref |
| `shoes` | ObjectId | Product ref |
| `accessories` | [ObjectId] | Product refs |
| `scores.total` | Number | Final weighted score (0–1) |
| `scores.embeddingSimilarity` | Number | Cosine similarity |
| `scores.colorCompatibility` | Number | Color matrix score |
| `scores.occasionCompatibility` | Number | Jaccard occasion overlap |
| `scores.styleCompatibility` | Number | Jaccard style overlap |
| `isAIGenerated` | Boolean | AI vs user-created |

### ScraperLog
Full audit trail per scrape run.

| Field | Type | Description |
|-------|------|-------------|
| `runId` | String | Unique ISO timestamp |
| `status` | String | `running` \| `completed` \| `failed` \| `partial` |
| `triggeredBy` | String | `cron` \| `admin` \| `manual` |
| `stats` | Object | `{ totalInserted, totalUpdated, totalSkipped, totalFailed }` |
| `brandResults` | [Object] | Per-brand breakdown with strategy used |
| `durationMs` | Number | Total run time |

### Favorite
Normalized join table — unique compound index on `{ user, product }`.

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
| GET | `/featured` | — | 10 random products (6 clothing + 4 shoes) |
| GET | `/stats` | — | Counts by category/brand, price range |
| GET | `/:id` | — | Single product details |

**Filter query params for `GET /`:**
`category`, `brand`, `color`, `occasion`, `minPrice`, `maxPrice`, `search`, `page`, `limit` (max 48), `sort` (`price_asc` | `price_desc` | `newest` | `name`)

### Recommendations — `/api/recommendations`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/:productId` | — | AI outfit recommendations for a product |
| POST | `/outfit` | — | Chat-based outfit generation via Gemini |

**POST `/outfit` body:**
```json
{ "message": "Need a ferozi lawn suit for Eid under 8000" }
```

**POST `/outfit` response shape:**
```json
{
  "intent": {
    "color": "Teal",
    "shade": "ferozi",
    "occasion": ["eid"],
    "style": ["elegant", "traditional"],
    "maxBudget": 8000,
    "intentSummary": "A teal lawn suit for Eid under PKR 8,000.",
    "aiAnalysis": "Ferozi is one of the most beloved Eid colors in Pakistan..."
  },
  "outfit": {
    "heroDress": { ...product },
    "otherDresses": [ ...9 products ],
    "shoes": [ ...6 products ],
    "scores": [ { "productId": "...", "total": 0.91, "colorMatch": 1.0, ... } ]
  }
}
```

### Search — `/api/search`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | — | Full-text search with pagination |
| GET | `/suggestions` | — | Top 5 autocomplete matches |

### Favorites — `/api/favorites`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | JWT | User's saved products |
| POST | `/:productId` | JWT | Toggle favorite (add/remove) |
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
| PUT | `/auth/change-password` | Admin | Change admin password securely |

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
            Brand-specific CSS selectors
```

### Product Normalization

Every raw scraped item passes through `productParser.js`:

1. Normalize brand name and category (inferred from URL/name patterns)
2. Strip and convert price string → Number (PKR)
3. Extract colors from name, description, and tags
4. Infer occasion from keywords (`eid`, `formal`, `wedding`, `casual`)
5. Infer style from keywords (`embroidered`, `printed`, `minimal`)
6. Calculate `metadataScore` (0–1 data completeness)
7. Upsert to MongoDB using `productUrl` as unique key

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

### Scoring Formula

```
finalScore = (embeddingSimilarity × 0.50)
           + (colorCompatibility  × 0.20)
           + (occasionMatch       × 0.20)
           + (styleMatch          × 0.10)
```

### Components

**Embedding Similarity (50%)**  
Cosine similarity between Gemini-generated embedding vectors stored on each product. Falls back to keyword Jaccard similarity when embeddings are absent.

**Color Compatibility (20%)**  
Looks up `primaryColor` pair in the 14×14 color theory matrix and returns a 0–1 fashion compatibility score.

**Occasion Match (20%)**  
Jaccard index: `|intersection| / |union|` over `occasion[]` arrays.

**Style Match (10%)**  
Jaccard index over `style[]` arrays.

### Chat-Based Generation (Gemini)

```
User query → Gemini parses intent → structured filters
    → MongoDB query → candidate products
    → score all clothing × shoes pairs
    → return top 5 ranked outfits
```

---

## Color Theory Engine

A handcrafted 15×15 fashion color compatibility matrix (`colorTheory.js`).

**15 canonical colors:** Black, White, Grey, Red, Pink, Purple, Blue, Green, Teal, Yellow, Orange, Gold, Beige, Brown, Multicolor

**Selected compatibility scores:**

| Color A | Color B | Score | Note |
|---------|---------|-------|------|
| Black | Gold | 1.0 | Classic luxury |
| Black | White | 1.0 | Timeless contrast |
| White | Blue | 0.95 | Fresh, clean |
| Pink | White | 0.9 | Feminine |
| Red | Orange | 0.2 | Clashing warm tones |
| Purple | Orange | 0.3 | Low compatibility |
| Pink | Red | 0.3 | Similar warm tones |

**Neutral colors** (Black, White, Grey, Gold, Silver, Beige, Brown, Multicolor) score ≥ 0.7 against virtually any color.

**Color alias resolution** — 180+ aliases mapped to canonical names before lookup, including Pakistani Urdu transliterations:
- `ferozi/firozi` → Teal, `jamuni/baingan` → Purple, `gulabi` → Pink
- `mehroon/surkh/laal` → Red, `nila` → Blue, `narangi` → Orange
- `zard/peela` → Yellow, `safed` → White, `dhani/mehendi/sabz` → Green

Multi-color products use best-pair scoring across all `colors[]` combinations.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret (use a long random string) |
| `PORT` | No | `5000` | Express server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `FRONTEND_URL` | Yes | — | CORS allowed origin (e.g., `http://localhost:3000`) |
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |
| `REPLICATE_API_KEY` | No | — | Replicate API token for IDM-VTON virtual try-on (free at replicate.com) |
| `HUGGINGFACE_API_KEY` | No | — | HuggingFace token for semantic vector search (free at huggingface.co/settings/tokens) |
| `SCRAPER_DRY_RUN` | No | `false` | `true` = parse without writing to DB |
| `SCRAPER_MAX_PER_BRAND` | No | `50` | Max products to scrape per brand per run |
| `SCRAPER_DELAY_MS` | No | `1500` | Delay between HTTP requests (ms) |
| `SCRAPER_RETRY_LIMIT` | No | `3` | Max retries on failed requests |
| `SCRAPER_CRON_SCHEDULE` | No | `0 3 * * 0` | Cron expression (default: Sunday 3 AM) |
| `ADMIN_NAME` | Yes | — | Name of the admin for seeder script |
| `ADMIN_EMAIL` | Yes | — | Email of the admin for seeder script |
| `ADMIN_PASSWORD` | Yes | — | Initial password of the admin for seeder script |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL (e.g., `https://aurafit-8e3u.onrender.com/api`) |

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB (local) or MongoDB Atlas account
- Google Cloud project with Gemini API enabled

### 1. Install dependencies

```bash
# Backend
cd AuraFit/backend
npm install

# Frontend
cd AuraFit/frontend
npm install
```

### 2. Configure environment

```bash
# Backend
cd AuraFit/backend
cp .env.example .env
# Fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY, FRONTEND_URL
# Fill in ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
```

```bash
# Frontend
cd AuraFit/frontend
echo "NEXT_PUBLIC_API_URL=https://aurafit-8e3u.onrender.com/api" > .env.local
```

### 3. Start the backend

```bash
cd AuraFit/backend
npm run dev
# Running at https://aurafit-8e3u.onrender.com
```

### 4. Start the frontend

```bash
cd AuraFit/frontend
npm run dev
# Running at http://localhost:3000
```

### 5. Seed the Admin Account

Since public registration is disabled for security, you must seed the initial admin account:

```bash
cd AuraFit/backend
npm run seed:admin
```

### 6. Populate the database

```bash
cd AuraFit/backend
npm run scrape        # Live scrape — writes to DB
npm run scrape:dry    # Dry run — no DB writes (testing)
```

---

## Admin Dashboard

Access at `/admin` after logging in with an admin account.

**Dashboard features:**
- Total products in DB, broken down by brand and category
- 7-day product growth stats
- Last 20 scraper run logs with per-brand result breakdown
- Live scraper status (running / idle)
- Manual scrape trigger button
- Delete all products for a specific brand

---

## Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| Start production | `npm start` | `node server.js` |
| Start dev (watch) | `npm run dev` | `nodemon server.js` |
| Run scraper | `npm run scrape` | Execute full scrape, write to DB |
| Dry-run scraper | `npm run scrape:dry` | Execute scrape, no DB writes |
| Seed Admin | `npm run seed:admin` | Create admin from .env credentials |
| Run tests | `npm test` | `node --test` |

---

*Built for the Pakistani Fashion Community*
