# AuraFit — Comprehensive Project Report

**Date:** May 10, 2026  
**Project:** AuraFit — AI-Powered Pakistani Fashion Platform  
**Stack:** MERN (MongoDB, Express, React/Next.js, Node.js)  
**Module System:** ES Modules (`"type": "module"`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Goals & Scope](#2-project-goals--scope)
3. [System Architecture](#3-system-architecture)
4. [Technology Stack — Full Dependency Audit](#4-technology-stack--full-dependency-audit)
5. [Backend Deep Dive](#5-backend-deep-dive)
   - [5.1 Server Bootstrap & Middleware Chain](#51-server-bootstrap--middleware-chain)
   - [5.2 Authentication & Authorization](#52-authentication--authorization)
   - [5.3 Database Models — Schema Analysis](#53-database-models--schema-analysis)
   - [5.4 API Routes — Endpoint Catalog](#54-api-routes--endpoint-catalog)
   - [5.5 Scraper Pipeline — Architecture & Flow](#55-scraper-pipeline--architecture--flow)
   - [5.6 AI Recommendation Engine](#56-ai-recommendation-engine)
   - [5.7 Color Theory Engine](#57-color-theory-engine)
   - [5.8 Job Scheduling](#58-job-scheduling)
6. [Frontend Deep Dive](#6-frontend-deep-dive)
   - [6.1 Page Inventory](#61-page-inventory)
   - [6.2 Component Library](#62-component-library)
   - [6.3 State Management & Auth Context](#63-state-management--auth-context)
   - [6.4 API Client Layer](#64-api-client-layer)
   - [6.5 Design System](#65-design-system)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [Security Analysis](#8-security-analysis)
9. [Performance & Scalability Analysis](#9-performance--scalability-analysis)
10. [Environment Configuration Reference](#10-environment-configuration-reference)
11. [Setup & Deployment Guide](#11-setup--deployment-guide)
12. [Known Issues & Recommendations](#12-known-issues--recommendations)
13. [Project Metrics Summary](#13-project-metrics-summary)

---

## 1. Executive Summary

AuraFit is a production-grade, full-stack fashion e-commerce intelligence platform built specifically for the **Pakistani market**. It addresses a clear market gap: Pakistani fashion shoppers lack a single intelligent platform that aggregates products across the country's top brands and recommends complete, AI-curated, color-coordinated outfits.

**What the platform does:**

1. Automatically scrapes product catalogs from **10 leading Pakistani fashion brands** on a weekly cron schedule using a modular, multi-strategy extraction pipeline.
2. Normalizes all scraped data into a unified MongoDB schema with inferred metadata (colors, occasions, styles, fabric).
3. Recommends complete outfits (clothing + shoes) using a four-factor AI scoring system: semantic embeddings, color theory, occasion matching, and style matching.
4. Accepts **natural language chat queries** (powered by Google Gemini 2.5 Flash) and returns curated outfit suggestions instantly.
5. Provides users with a personal favorites system, advanced product discovery filters, and semantic search.
6. Gives administrators full operational visibility and control via a real-time dashboard.

The system is engineered for modularity and maintainability: each brand scraper is independently configurable via an adapter class, the recommendation engine is composable with pluggable scoring factors, and the frontend is fully type-safe with TypeScript.

---

## 2. Project Goals & Scope

### Primary Goals

| Goal | How It's Implemented |
|------|---------------------|
| Aggregate Pakistani fashion product data | 10-brand modular scraper, 3-strategy waterfall extraction |
| AI outfit recommendations | Weighted scoring: embeddings (50%) + color (20%) + occasion (20%) + style (10%) |
| Natural language style assistance | Google Gemini 2.5 Flash for intent parsing → structured filters |
| User personalization | Favorites system, user preference profiles |
| Admin operational control | Dashboard: stats, scraper logs, manual trigger |
| Production-ready security | JWT auth, bcrypt, rate limiting, Helmet, CORS |
| Automated catalog refresh | node-cron: every Sunday 3:00 AM PKT |

### Out of Scope (Current Version)

- Payment/checkout integration
- Real-time inventory or stock-level tracking per SKU
- Social sharing or community features
- Native mobile application
- Multi-currency pricing
- User reviews or outfit ratings

---

## 3. System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                              │
│                   Next.js 16 + TypeScript                         │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Home /  │  │ Discover │  │ Product  │  │ Admin Dashboard  │  │
│  │  AI Chat │  │ /Search  │  │ Detail   │  │                  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
└────────────────────────────┬──────────────────────────────────────┘
                             │ HTTPS / Axios (Bearer JWT)
┌────────────────────────────▼──────────────────────────────────────┐
│                     API GATEWAY (Express 4)                        │
│                                                                    │
│  /api/auth  •  /api/products  •  /api/recommendations             │
│  /api/search  •  /api/favorites  •  /api/admin  •  /api/health    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Middleware Stack:                                           │  │
│  │  Helmet → CORS → JSON Parser → Rate Limiter → JWT Auth      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────┬───────────────────────────────┬────────────────────────┘
           │                               │
┌──────────▼──────────┐         ┌──────────▼──────────────────────┐
│   SERVICES LAYER    │         │       SCRAPER PIPELINE          │
│  ─────────────────  │         │  ──────────────────────────     │
│  recommendationEngine│        │  index.js (orchestrator)        │
│  colorTheory        │         │  10 Brand Adapters              │
│  Google Gemini API  │         │  3-Strategy Extraction          │
│                     │         │  productParser (normalizer)     │
│                     │         │  node-cron (weekly scheduler)   │
└──────────┬──────────┘         └──────────┬──────────────────────┘
           │                               │
┌──────────▼───────────────────────────────▼────────────────────────┐
│                    DATA LAYER — MongoDB Atlas                       │
│                                                                     │
│  Collections:                                                       │
│  users  │  products  │  outfits  │  favorites  │  scraperlogs      │
└─────────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────────┐
│                    EXTERNAL SERVICES                               │
│   Google Gemini 2.5 Flash API  │  10 Pakistani Brand Websites     │
└───────────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Stack — Full Dependency Audit

### Backend (`backend/package.json`)

| Package | Version | Role |
|---------|---------|------|
| `express` | ^4.21.2 | HTTP server, routing, middleware |
| `mongoose` | ^8.12.0 | MongoDB ODM — schema, validation, queries |
| `jsonwebtoken` | ^9.0.3 | JWT signing and verification |
| `bcryptjs` | ^3.0.3 | Password hashing with automatic salting |
| `@google/generative-ai` | ^0.24.1 | Gemini 2.5 Flash SDK — embeddings + intent parsing |
| `axios` | ^1.7.9 | HTTP client for scraping and external APIs |
| `cheerio` | ^1.0.0 | jQuery-like HTML parsing for scraping fallback |
| `node-cron` | ^4.2.1 | Cron-based job scheduler |
| `cors` | ^2.8.5 | Cross-origin resource sharing |
| `helmet` | ^8.1.0 | HTTP security headers (CSP, HSTS, etc.) |
| `express-rate-limit` | ^8.5.1 | Per-IP rate limiting |
| `uuid` | ^14.0.0 | Unique scraper run IDs |
| `dotenv` | ^16.4.7 | Environment variable loading from `.env` |
| `nodemon` | ^3.1.9 | Dev: auto-restart on file changes |
| `cross-env` | ^10.1.0 | Cross-platform env var injection (dry-run script) |

### Frontend (`frontend/package.json`)

| Package | Version | Role |
|---------|---------|------|
| `next` | 16.x | React meta-framework with App Router |
| `react` | 19.x | UI library |
| `react-dom` | 19.x | DOM renderer |
| `typescript` | ~5.x | Static type checking |
| `axios` | ^1.x | HTTP client with request/response interceptors |

### Infrastructure & Services

| Component | Technology | Notes |
|-----------|-----------|-------|
| Database | MongoDB Atlas | Cloud-hosted, M0 (dev) recommended M10+ (prod) |
| AI | Google Gemini 2.5 Flash | Intent parsing + embedding generation |
| Runtime | Node.js v18+ | ES Modules (`"type": "module"` in backend) |
| Logging | Winston | Structured JSON logs |
| Process (prod) | PM2 (recommended) | Not in repo, must be added |

---

## 5. Backend Deep Dive

### 5.1 Server Bootstrap & Middleware Chain

**Entry point:** `backend/server.js`

The Express application is initialized with a strictly ordered middleware chain:

```
Incoming Request
      │
      ▼
 1. helmet()              — Set security HTTP headers
      │
      ▼
 2. cors({ origin: FRONTEND_URL, credentials: true })
      │
      ▼
 3. express.json()        — Parse JSON request bodies
      │
      ▼
 4. globalRateLimiter     — 300 req / 15 min per IP
      │
      ▼
 5. /api/auth             — Auth-specific limiter: 20 req / 15 min
 6. /api/products
 7. /api/recommendations
 8. /api/search
 9. /api/favorites        — Requires JWT
10. /api/admin            — Requires JWT + admin role
11. /api/health           — GET returns { status: "ok" }
      │
      ▼
 12. Global Error Handler  — Catches unhandled errors, returns 500
```

**Rate Limiting Details:**

| Limiter | Scope | Limit | Window |
|---------|-------|-------|--------|
| Global | All routes | 300 requests | 15 minutes |
| Auth | `/api/auth/*` | 20 requests | 15 minutes |

---

### 5.2 Authentication & Authorization

**File:** `backend/middleware/auth.js`

Two middleware functions are exported:

**`authenticateToken`** — Verifies JWT for protected routes:
```
Authorization: Bearer <token>
    │
    ▼
jwt.verify(token, JWT_SECRET)
    │
    ├─► Invalid / expired → 401 Unauthorized
    └─► Valid → attach { id, role } to req.user → next()
```

**`adminOnly`** — Role guard used after `authenticateToken`:
```
req.user.role === "admin"
    ├─► false → 403 Forbidden
    └─► true → next()
```

**Token generation** (at login):
- Payload: `{ id: user._id, role: user.role }`
- Algorithm: HS256
- Expiry: 30 days
- Secret: `JWT_SECRET` from environment

**Admin bootstrap:** The first user to call `POST /api/auth/register` is automatically assigned `role: "admin"` (checked by counting existing users in DB before insert).

---

### 5.3 Database Models — Schema Analysis

#### User (`models/User.js`)

```
Field            Type      Constraints           Description
──────────────── ───────── ─────────────────── ──────────────────────────
_id              ObjectId  auto                MongoDB document ID
name             String    required            Display name
email            String    required, unique    Lowercase enforced
                           lowercase
password         String    required, min 6     bcrypt hashed (not returned)
role             String    enum: user|admin    Default: "user"
preferences      Object    —                   {
                                                 occasions: [String],
                                                 styles: [String],
                                                 favoriteColors: [String],
                                                 budget: { min, max }
                                               }
favoriteProducts [ObjectId] ref: Product      Legacy field (see Favorite model)
createdAt        Date      auto (timestamps)
updatedAt        Date      auto (timestamps)
```

#### Product (`models/Product.js`)

Unified schema for all product categories (clothing, shoes, accessories).

```
Field           Type       Constraints         Description
─────────────── ────────── ─────────────────── ─────────────────────────────
_id             ObjectId   auto
name            String     required            Product name
brand           String     required            Brand name
category        String     enum: clothing|     Product category
                           shoes|accessories
subCategory     String     —                   "2-piece", "heels", etc.
style           [String]   —                   ["elegant", "traditional"]
occasion        [String]   —                   ["wedding", "eid", "casual"]
season          [String]   —                   ["summer", "winter"]
fabric          String     —                   Clothing fabric type
colors          [String]   —                   All detected colors
primaryColor    String     —                   Dominant color for matching
sizes           [String]   —                   Available size options
images          [String]   —                   Image URL array
imageUrl        String     —                   Primary display image
description     String     —                   Product description text
tags            [String]   —                   Searchable keyword tags
price           Number     —                   Price in PKR
compareAtPrice  Number     —                   Original price (sale items)
currency        String     default: "PKR"      Currency code
productUrl      String     required, unique    Source URL (upsert key)
source          String     —                   Brand identifier slug
handle          String     —                   URL-friendly slug
embedding       [Number]   —                   Gemini semantic vector
embeddingModel  String     —                   Model name used for embedding
metadataScore   Number     —                   0–1 data completeness score
scrapedAt       Date       —                   First seen timestamp
updatedAt       Date       auto                Last modified
```

**Compound Indexes:**

| Index | Fields | Purpose |
|-------|--------|---------|
| idx_brand_category | `{ brand: 1, category: 1 }` | Brand browsing |
| idx_color_category | `{ primaryColor: 1, category: 1 }` | Color-based outfit matching |
| idx_occasion | `{ occasion: 1 }` | Occasion filtering |
| idx_price | `{ price: 1 }` | Price sorting and range queries |
| idx_tags | `{ tags: 1 }` | Tag-based search |
| idx_text | `{ name: "text", description: "text", tags: "text" }` | Full-text search |

#### Outfit (`models/Outfit.js`)

```
Field                          Type       Description
────────────────────────────── ────────── ────────────────────────────────
_id                            ObjectId   auto
name                           String     Outfit display name
description                    String     AI-generated description
createdBy                      ObjectId   User ref
isAIGenerated                  Boolean    AI vs user-created outfit
clothing                       ObjectId   Product ref (required)
shoes                          ObjectId   Product ref (required)
accessories                    [ObjectId] Product refs (optional)
scores.total                   Number     Final weighted score (0–1)
scores.embeddingSimilarity     Number     Cosine similarity component
scores.colorCompatibility      Number     Color matrix score component
scores.occasionCompatibility   Number     Jaccard occasion overlap
scores.styleCompatibility      Number     Jaccard style overlap
occasion                       [String]   Outfit occasions
style                          [String]   Outfit styles
tags                           [String]   Searchable tags
likes                          Number     User upvote count
createdAt / updatedAt          Date       auto
```

#### Favorite (`models/Favorite.js`)

```
Field      Type      Constraints                     Description
────────── ───────── ─────────────────────────────── ──────────────────
user       ObjectId  required, ref: User             The user
product    ObjectId  required, ref: Product          The product
                     unique index: {user, product}   Prevents duplicates
createdAt  Date      auto
```

#### ScraperLog (`models/ScraperLog.js`)

```
Field              Type      Description
────────────────── ───────── ───────────────────────────────────────────
runId              String    Unique ISO timestamp string (unique index)
status             String    "running" | "completed" | "failed" | "partial"
triggeredBy        String    "cron" | "admin" | "manual"
startedAt          Date      Run start time
completedAt        Date      Run end time (null if still running)
durationMs         Number    Total duration in milliseconds
stats.totalBrands  Number    Number of brands attempted
stats.totalInserted Number   New documents inserted
stats.totalUpdated  Number   Existing documents updated
stats.totalSkipped  Number   Duplicates skipped (no changes)
stats.totalFailed   Number   Products that failed to parse/insert
brandResults       [Object]  Per-brand: { brand, url, inserted, updated,
                              skipped, failed, strategy, error }
failedUrls         [Object]  { url, reason } for each failed request
error              String    Top-level error message if run failed entirely
createdAt          Date      auto
```

---

### 5.4 API Routes — Endpoint Catalog

#### `POST /api/auth/register`

Creates a new user account.

**Request body:**
```json
{ "name": "Zainab", "email": "user@example.com", "password": "secure123" }
```

**Business logic:**
- Validates all fields present
- Checks email not already registered
- Hashes password with bcrypt (salt rounds: 10)
- If total user count === 0, assigns `role: "admin"`
- Returns `{ token, user: { id, name, email, role } }`

**Responses:** `201 Created` | `400 Bad Request` | `409 Conflict`

---

#### `POST /api/auth/login`

**Request body:**
```json
{ "email": "user@example.com", "password": "secure123" }
```

**Business logic:**
- Finds user by email
- `bcrypt.compare(password, hash)`
- Signs JWT: `{ id, role }`, 30-day expiry
- Returns `{ token, user: { id, name, email, role } }`

**Responses:** `200 OK` | `400` | `401 Unauthorized`

---

#### `GET /api/products`

Returns a paginated, filtered product list.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `category` | String | `clothing` \| `shoes` \| `accessories` |
| `brand` | String | Exact brand name match |
| `color` | String | Matches any item in `colors[]` array |
| `occasion` | String | Matches any item in `occasion[]` array |
| `minPrice` | Number | Minimum price (PKR) |
| `maxPrice` | Number | Maximum price (PKR) |
| `search` | String | Full-text search query |
| `page` | Number | Page number (default: 1) |
| `limit` | Number | Per page (default: 24, max: 48) |
| `sort` | String | `price_asc` \| `price_desc` \| `newest` \| `name` |

**Response:** `{ products: [...], total, page, totalPages }`

---

#### `GET /api/recommendations/:productId`

Returns AI-scored outfit recommendations for a given product.

**Logic:**
1. Load base product
2. Determine complementary category (clothing → shoes, shoes → clothing)
3. Fetch all products in complementary category
4. Score each with the recommendation engine
5. Sort descending, return top 10

**Response:**
```json
{
  "baseProduct": { ...product },
  "recommendations": [
    {
      "product": { ...product },
      "score": 0.847,
      "breakdown": {
        "embedding": 0.91,
        "color": 0.85,
        "occasion": 0.80,
        "style": 0.75
      }
    }
  ]
}
```

---

#### `POST /api/recommendations/outfit`

Natural language outfit generation.

**Request body:**
```json
{ "message": "Need a pastel outfit for Eid", "userId": "optional" }
```

**Logic:**
1. Send message to Gemini 2.5 Flash with structured extraction prompt
2. Parse response: `{ occasion, colors, style, category }`
3. Query MongoDB for matching products
4. Score all clothing × shoes pairs
5. Return top 5 ranked outfits with AI-generated description

---

#### `GET /api/admin/stats`

Returns platform-level statistics (admin only).

**Response:**
```json
{
  "totalProducts": 1240,
  "byCategory": { "clothing": 820, "shoes": 380, "accessories": 40 },
  "byBrand": { "Khaadi": 200, "Beechtree": 180, ... },
  "sevenDayGrowth": 145,
  "totalUsers": 37,
  "totalFavorites": 284
}
```

---

### 5.5 Scraper Pipeline — Architecture & Flow

#### File Structure

```
scripts/scrapers/
├── index.js              Orchestrator — runs all brands, creates ScraperLog
├── scraper.js            Core logic — runs a single adapter, handles retries
├── adapters/
│   ├── BaseAdapter.js    Abstract class: defines { brand, urls, category }
│   ├── KhaadiAdapter.js
│   ├── BeechtreeAdapter.js
│   ├── LimelightAdapter.js
│   ├── AlkaramAdapter.js
│   ├── GulAhmedAdapter.js
│   ├── StyloAdapter.js
│   ├── ECSAdapter.js
│   ├── BorjanAdapter.js
│   ├── HushPuppiesAdapter.js
│   └── NdureAdapter.js
├── extractors/
│   ├── shopifyExtractor.js   Strategy 1: Shopify JSON API
│   └── htmlExtractor.js      Strategy 3: Cheerio HTML parsing
├── parsers/
│   └── productParser.js      Normalize raw data → Product schema
├── utils/
│   ├── colorInference.js     Extract colors from image URL/name/description
│   ├── requestUtils.js       Axios client + exponential backoff retry
│   └── logger.js             Winston logger (console + file)
└── config/
    ├── clothingBrands.js     Clothing brand definitions + collection URLs
    └── shoeBrands.js         Shoe brand definitions + collection URLs
```

#### Brand Adapter Pattern

Each adapter extends `BaseAdapter` and declares:

```javascript
class KhaadiAdapter extends BaseAdapter {
  brand = 'Khaadi';
  category = 'clothing';
  urls = [
    'https://khaadi.com/collections/all-pret',
    'https://khaadi.com/collections/formal-collection',
    // ... additional collection URLs
  ];
}
```

The orchestrator iterates adapters, calls the extraction waterfall for each URL, and aggregates results.

#### Extraction Waterfall (per URL)

```
Brand collection URL
        │
        ▼
Strategy 1: shopifyExtractor.js
  GET {url}/products.json?limit=250&page=1
  GET {url}/products.json?limit=250&page=2  ... (paginate until empty)
  Parse Shopify product JSON
        │
        ▼ (404, timeout, or non-Shopify response)
Strategy 2: scraper.js site-wide fallback
  Crawl site sitemap or product listing pages
        │
        ▼ (no structured data found)
Strategy 3: htmlExtractor.js
  GET collection HTML page
  Cheerio parse product cards
  Extract: title, price, image src, product href
```

#### Product Normalization (`productParser.js`)

Each raw extracted product passes through this pipeline:

```
Raw scraped object
        │
        ▼
1. brand → normalize to canonical name (e.g., "khaadi" → "Khaadi")
2. category → inferred from adapter.category or URL pattern
3. subCategory → keyword match ("2-piece", "kurta", "heels", "sneakers")
4. price → strip "Rs.", commas → parseFloat → Number (PKR)
5. compareAtPrice → same normalization
6. colors → extract from: title keywords, description, tag list
7. primaryColor → first/most prominent detected color
8. occasion → keyword scan: ["eid","formal","bridal","casual","office","party"]
9. style → keyword scan: ["embroidered","printed","solid","minimal","western"]
10. season → keyword scan: ["summer","winter","spring","all-season"]
11. tags → merge: brand, category, colors, occasion, style, subCategory
12. metadataScore → count non-empty key fields / total fields (0–1 float)
13. scrapedAt → Date.now() (only set on insert, not update)
        │
        ▼
MongoDB upsert: { productUrl: url } as filter
  → If exists: update changed fields
  → If new: insert full document
  → Record: inserted++ or updated++ or skipped++
```

#### Scraper Configuration

| Variable | Default | Effect |
|----------|---------|--------|
| `SCRAPER_DRY_RUN` | `false` | Skip all MongoDB writes |
| `SCRAPER_MAX_PER_BRAND` | `50` | Stop after N products per brand |
| `SCRAPER_DELAY_MS` | `1500` | Pause between HTTP requests |
| `SCRAPER_RETRY_LIMIT` | `3` | Max retries with exponential backoff |
| `SCRAPER_CRON_SCHEDULE` | `0 3 * * 0` | When the cron job fires |

#### ScraperLog Lifecycle

```
Trigger (cron / POST /api/admin/scraper/run)
        │
        ▼
Create ScraperLog document:
  { runId: new Date().toISOString(), status: "running", triggeredBy }
        │
        ▼
For each adapter (sequential):
  For each URL in adapter.urls:
    Apply extraction waterfall
    Parse + upsert products
    Accumulate: { inserted, updated, skipped, failed }
    Record which strategy succeeded
        │
        ▼
Aggregate all brand results into total stats
Update ScraperLog:
  { status: "completed|partial|failed", stats, brandResults, durationMs, completedAt }
        │
        ▼
Winston logs written (console + log file)
```

---

### 5.6 AI Recommendation Engine

**File:** `backend/services/recommendationEngine.js`

#### Scoring Formula

```
finalScore = (embeddingSimilarity × 0.50)
           + (colorCompatibility  × 0.20)
           + (occasionMatch       × 0.20)
           + (styleMatch          × 0.10)
```

All component scores are normalized to the range [0, 1].

#### Component 1: Embedding Similarity (50% weight)

Uses pre-computed Gemini embedding vectors stored on each `Product` document.

```
cosine_similarity(A, B) = dot(A, B) / (||A|| × ||B||)
```

- Both products must have non-empty `embedding[]` arrays.
- **Fallback:** If either product has no embedding, falls back to keyword-based Jaccard similarity computed over `tags[]` arrays.
- Embedding vectors are generated by the Gemini embedding API during the scraping step and stored on the product document.

#### Component 2: Color Compatibility (20% weight)

Delegates to `colorTheory.js`. Looks up `productA.primaryColor` × `productB.primaryColor` in the 14×14 matrix and returns the compatibility score.

If either product has no `primaryColor`, the engine iterates all `colors[]` pairs and takes the best (max) combination score.

#### Component 3: Occasion Match (20% weight)

```javascript
Jaccard(A.occasion, B.occasion) = |A ∩ B| / |A ∪ B|
```

Example:
- A.occasion = `["eid", "wedding"]`
- B.occasion = `["eid", "formal"]`
- Intersection = `["eid"]` → size 1
- Union = `["eid", "wedding", "formal"]` → size 3
- Score = `1/3 ≈ 0.33`

#### Component 4: Style Match (10% weight)

Same Jaccard computation over `style[]` arrays. Given lower weight because style compatibility is more subjective and flexible than occasion.

#### Chat-Based Generation (Gemini + Intent Scoring)

```
POST /api/recommendations/outfit { message }
        │
        ▼
Gemini 2.5 Flash — structured prompt includes:
  - List of 15 CANONICAL_COLORS — Gemini must map any shade to one of these
  - Exhaustive shade→canonical mapping table (180+ variants including Urdu)
  - Returns JSON with 6 fields including new 'shade' field
        │
        ▼
Gemini JSON response:
  {
    color:         "Orange"         ← canonical (always one of 15)
    shade:         "tangerine"      ← raw word user typed (NEW)
    occasion:      ["casual"]
    style:         ["trendy"]
    maxBudget:     0
    intentSummary: "..."
    aiAnalysis:    "..."
  }
        │
        ▼
Safety net: validate color is canonical; substring fallback if Gemini slips
        │
        ▼
getOutfitForQuery(parsedIntent)
  - Fetch 300 clothing (budget filter only — NO color filter at DB level)
  - Score each with scoreProductAgainstIntent()
        │
        ▼
scoreProductAgainstIntent() — three-tier color scoring:
  Tier 1 (1.00): raw shade in DB matches user's shade ("tangerine" = "tangerine")
  Tier 2 (0.82): canonical alias match ("coral" → Orange = "Orange")
  Tier 3 (0.08): wrong color family (hard penalty)
        │
        ▼
Sort by finalScore DESC → take top 10
heroDress = top 1, otherDresses = top 2–10
        │
        ▼
Score 150 shoes against heroDress (System A — product-to-product)
Return top 6 shoes
        │
        ▼
Return: { heroDress, otherDresses[9], shoes[6], scores[10] }
```

---

### 5.7 Color Theory Engine

**File:** `backend/services/colorTheory.js`

A hand-crafted, fashion-informed 14×14 color compatibility matrix. Scores are based on fashion design principles: complementary colors, analogous palettes, and established Pakistani fashion pairings.

#### Supported Canonical Colors (15 base)

`Black` • `White` • `Grey` • `Blue` • `Green` • `Red` • `Pink` • `Purple` • `Yellow` • `Orange` • `Gold` • `Teal` • `Beige` • `Brown` • `Multicolor`

> Note: `Beige` is a full compatibility matrix row (not just an alias). `Multicolor` and `Beige` are members of `NEUTRAL_COLORS` and score ≥ 0.7 against any color.

#### Compatibility Score Reference (Selected Pairs)

| Color A | Color B | Score | Fashion Rationale |
|---------|---------|-------|-------------------|
| Black | Gold | 1.0 | Classic luxury pairing |
| Black | White | 1.0 | Timeless high-contrast |
| Maroon | Gold | 1.0 | Pakistani bridal/formal standard |
| Navy | White | 0.95 | Sharp, clean formal combination |
| Pink | Gold | 0.9 | Feminine festive combination |
| Maroon | Beige | 0.85 | Warm earthy traditional pairing |
| Blue | White | 0.9 | Crisp, versatile combination |
| Green | Gold | 0.85 | Festive, traditional |
| Red | Orange | 0.2 | Clashing warm tones |
| Purple | Orange | 0.2 | Low fashion compatibility |
| Yellow | Red | 0.3 | Overly saturated clash |

**Neutral color rule:** Black, White, Grey, Gold, Silver, Beige, Brown all score ≥ 0.7 against virtually any other color because they are versatile anchors.

**Color normalization** (aliases handled — 180+ entries, synced between `colorTheory.js` and `recommendationEngine.js`):

| Input | Normalized | Notes |
|-------|-----------|-------|
| "Off-White", "Ivory", "Cream" | "White" | |
| "Lavender", "Lilac", "Mauve" | "Purple" | |
| "Navy", "Cobalt", "Indigo" | "Blue" | |
| "Maroon", "Burgundy", "Wine" | "Red" | |
| "Coral", "Tangerine", "Amber" | "Orange" | |
| "Olive", "Mint", "Sage" | "Green" | |
| "Beige", "Nude", "Camel", "Khaki" | "Beige" | Fixed: was wrongly mapped to Gold |
| "Turquoise", "Aqua", "Cyan" | "Teal" | |
| "Golden", "Bronze", "Champagne" | "Gold" | |
| **Pakistani Urdu terms:** | | |
| "Ferozi", "Firozi" | "Teal" | Very common in Pakistan |
| "Jamuni", "Baingan" | "Purple" | |
| "Gulabi" | "Pink" | |
| "Mehroon", "Mehrun" | "Red" | Maroon |
| "Surkh", "Laal" | "Red" | |
| "Nila" | "Blue" | Dark indigo |
| "Narangi" | "Orange" | |
| "Zard", "Peela" | "Yellow" | |
| "Safed" | "White" | |
| "Dhani", "Mehendi", "Sabz" | "Green" | |

**Multi-color products:** Iterates all combinations across both products' `colors[]` arrays and returns the maximum score found.

**Unknown color fallback:** Returns `0.5` (neutral, non-penalizing score) when a color is not in the matrix.

---

### 5.8 Job Scheduling

**File:** `backend/jobs/scraperJob.js`

```javascript
import cron from 'node-cron';

// Every Sunday at 3:00 AM PKT (Asia/Karachi)
cron.schedule('0 3 * * 0', async () => {
  await runScraper({ triggeredBy: 'cron' });
}, {
  timezone: 'Asia/Karachi'
});
```

- The cron job is registered when `server.js` starts.
- Scraper runs asynchronously — does not block the HTTP server.
- A `ScraperLog` document is created at the start and updated throughout.
- `POST /api/admin/scraper/run` fires the same `runScraper()` function on-demand.
- Multiple concurrent runs are guarded against by checking if a `ScraperLog` with `status: "running"` already exists.

---

## 6. Frontend Deep Dive

### 6.1 Page Inventory

All pages use Next.js 16 App Router (`src/app/`) with TypeScript.

| Route | File | Auth Required | Description |
|-------|------|--------------|-------------|
| `/` | `page.tsx` | No | Home: hero section, AI chat box, featured product carousel, how-it-works |
| `/discover` | `discover/page.tsx` | No | Product browser with full filter panel + pagination |
| `/search` | `search/page.tsx` | No | Debounced full-text search (300ms delay) |
| `/product/[id]` | `product/[id]/page.tsx` | No | Product detail, image gallery, AI recommendations carousel |
| `/favorites` | `favorites/page.tsx` | JWT | User's saved products |
| `/login` | `login/page.tsx` | No | Email + password login form |
| `/register` | `register/page.tsx` | No | Account creation form |
| `/admin` | `admin/page.tsx` | Admin JWT | Dashboard: stats, logs, scraper control |
| `/categories` | `categories/page.tsx` | No | Visual category browser |

#### Home Page (`/`)
- **Hero:** Full-width banner with tagline and primary CTA
- **ChatBox:** Text input → `POST /api/recommendations/outfit` → renders `RecommendationResult`
- **Featured Carousel:** 10 products from `GET /api/products/featured` rendered as `ProductCard` components
- **How It Works:** Three-step explainer section

#### Discover Page (`/discover`)
- Sidebar filter panel: category, brand (dropdown), color picker, occasion selector, price range inputs
- Product grid: 24 items/page with previous/next pagination
- All active filters reflected in URL query params (shareable, browser-back-compatible)
- Sort controls: price asc/desc, newest, alphabetical

#### Product Detail Page (`/product/[id]`)
- Image gallery with primary image + thumbnail strip
- Full metadata: brand, category, subCategory, occasion, colors, sizes, fabric, style
- Price display: current price + crossed-out compareAtPrice (if sale)
- "Buy on [Brand] Website" button (opens `productUrl` in new tab)
- Favorite toggle button (heart icon, calls `POST /api/favorites/:id`)
- AI Recommendations section: horizontal scroll carousel of top 5 complementary items with score badges

#### Admin Page (`/admin`)
- Requires `role: "admin"` — redirects to `/login` otherwise
- Stats cards: total products, users, favorites, 7-day growth
- Brand breakdown table
- Scraper status indicator (running / idle) with live polling
- "Run Scrape Now" button → `POST /api/admin/scraper/run`
- Log table: last 20 runs with status, trigger, duration, inserted/updated counts

---

### 6.2 Component Library

#### `Navbar.tsx`
- **Left:** Logo + "AuraFit" wordmark
- **Center:** Nav links — Home, Discover, Search, Categories
- **Right (unauthenticated):** Login | Register buttons
- **Right (authenticated):** username chip, Favorites link, Logout button
- Admin link injected when `user.role === "admin"`
- Glassmorphism backdrop with `backdrop-filter: blur(20px)`
- Sticky positioning (`position: sticky; top: 0; z-index: 100`)

#### `ProductCard.tsx`
- Next.js `<Image>` component with `onError` fallback to placeholder SVG
- Displays: brand name, product name (truncated at 2 lines), price (PKR formatted)
- Favorite toggle button: heart icon, calls `POST /api/favorites/:productId`
  - Optimistically updates UI state before API response
  - Reverts on error
- Full card is a clickable link to `/product/[id]`
- CSS: hover lift effect (`transform: translateY(-4px)`), box-shadow transition

#### `ChatBox.tsx`
- Controlled `<input>` with `value` + `onChange`
- Submit: Enter keypress or button click
- Loading state: button disabled + spinner shown during API call
- Error state: inline error message on API failure
- On success: passes outfit result up via `onResult(data)` callback prop

#### `RecommendationResult.tsx`
- Receives outfit array from chat or product detail
- Each outfit rendered as a two-column card: clothing (left) + shoes (right)
- Score badge: color-coded — green (≥ 0.7), yellow (≥ 0.5), red (< 0.5)
- Score breakdown tooltip: shows embedding / color / occasion / style breakdown on hover
- AI-generated outfit description displayed below product cards

---

### 6.3 State Management & Auth Context

**File:** `src/context/AuthContext.tsx`

```typescript
interface AuthContextType {
  user: User | null;        // { id, name, email, role }
  token: string | null;     // JWT string
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;       // true while validating stored token
}
```

**Initialization flow:**
```
App loads
    │
    ▼
AuthContext reads localStorage.getItem("fashion_token")
    │
    ├─► null → user = null, skip
    └─► token found → GET /api/auth/me (validate token)
            ├─► 401 → clear token, user = null
            └─► 200 → set user from response
```

**Login flow:**
```
login(email, password) called
    │
    ▼
POST /api/auth/login
    │
    ├─► Error → throw (caller shows error)
    └─► Success → localStorage.setItem("fashion_token", token)
                  setUser(user), setToken(token)
```

**Logout:**
```
logout() called
    │
    ▼
localStorage.removeItem("fashion_token")
setUser(null), setToken(null)
router.push("/")
```

---

### 6.4 API Client Layer

**File:** `src/lib/api.ts`

Axios instance configured with:

```typescript
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
});

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fashion_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("fashion_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
```

Typed helper functions are exported for each API domain (e.g., `getProducts(filters)`, `getRecommendations(id)`, `toggleFavorite(productId)`), providing full TypeScript inference throughout the app.

---

### 6.5 Design System

**File:** `src/app/globals.css`

**Theme:** Dark luxury Glassmorphism — deep blacks, gold accents, frosted glass surfaces.

```css
:root {
  --bg-primary:     #0a0a0f;                    /* Deep midnight */
  --bg-secondary:   #12121a;                    /* Subtle card background */
  --bg-glass:       rgba(255, 255, 255, 0.05);  /* Frosted overlay */
  --border-glass:   rgba(255, 255, 255, 0.10);  /* Frosted border */
  --accent-gold:    #d4a853;                    /* Pakistani luxury gold */
  --accent-pink:    #ff6b9d;                    /* Fashion accent */
  --text-primary:   #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.70);
  --text-muted:     rgba(255, 255, 255, 0.45);
  --radius-card:    16px;
  --shadow-card:    0 8px 32px rgba(0, 0, 0, 0.4);
}
```

**Glass card pattern:**
```css
.card {
  background:        var(--bg-glass);
  backdrop-filter:   blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border:            1px solid var(--border-glass);
  border-radius:     var(--radius-card);
  box-shadow:        var(--shadow-card);
}
```

**Interaction animations:**
- Hover lift: `transform: translateY(-4px)` with `transition: all 0.3s ease`
- Button press: `transform: scale(0.97)`
- Color transitions on focus and hover states

---

## 7. Data Flow Diagrams

### User Registration & First-Time Login

```
User fills registration form
        │
        ▼
POST /api/auth/register { name, email, password }
        │
        ▼
Count existing users in DB
  0 users → role = "admin"
  N users → role = "user"
        │
        ▼
bcrypt.hash(password, 10) → hashedPassword
        │
        ▼
Insert User document
        │
        ▼
jwt.sign({ id, role }, JWT_SECRET, { expiresIn: "30d" })
        │
        ▼
Return { token, user }
        │
        ▼
Frontend: localStorage.setItem("fashion_token", token)
          AuthContext: setUser(user), setToken(token)
          Router: redirect to "/"
```

### AI Chat Outfit Flow

```
User types: "Need a mehroon wedding outfit"
        │
        ▼
ChatBox submits → POST /api/recommendations/outfit
        │
        ▼
Backend: call Gemini 2.5 Flash API
  Prompt includes: 15 canonical colors + shade→canonical mapping table
  Input: "Need a mehroon wedding outfit"
  Output: {
    "color": "Red",          ← canonical (mehroon → Red)
    "shade": "mehroon",      ← raw word user typed
    "occasion": ["wedding"],
    "style": ["elegant", "traditional"],
    "maxBudget": 0,
    "intentSummary": "...",
    "aiAnalysis": "..."
  }
        │
        ▼
getOutfitForQuery(parsedIntent) — NO DB-level color filter
  Fetch 300 clothing products (budget filter only)
  Score each with scoreProductAgainstIntent():
    Tier 1 (1.0): primaryColor "mehroon" in DB → raw shade match
    Tier 2 (0.82): primaryColor "maroon" → normalizes to Red → canonical match
    Tier 3 (0.08): primaryColor "white" → wrong family, hard penalty
  Sort DESC, take top 10
        │
        ▼
Score 150 shoes against heroDress (product-to-product scoring)
Take top 6 shoes
        │
        ▼
Return: { intent, outfit: { heroDress, otherDresses[9], shoes[6], scores[10] } }
        │
        ▼
Frontend: AI Analysis card → Hero card → ranked grid (#2–#10) → Shoes section
```

### Weekly Auto-Scrape Flow

```
Sunday 3:00 AM PKT — node-cron fires
        │
        ▼
Check: ScraperLog with { status: "running" } exists?
  Yes → skip (prevent concurrent run)
  No → continue
        │
        ▼
Insert ScraperLog { status: "running", triggeredBy: "cron", runId, startedAt }
        │
        ▼
Load all brand adapters (10 total)
        │
        ▼
For each adapter:
  For each URL in adapter.urls:
    requestUtils.get(url)  [with exponential backoff, SCRAPER_RETRY_LIMIT retries]
        │
        ├─► Strategy 1: shopifyExtractor — GET /products.json?limit=250&page=N
        ├─► Strategy 2: site-wide fallback
        └─► Strategy 3: htmlExtractor — Cheerio parse HTML
        │
        ▼
    productParser.normalize(rawProduct)
        │
        ▼
    if (!SCRAPER_DRY_RUN):
      Product.findOneAndUpdate(
        { productUrl: url },
        { $set: normalizedProduct },
        { upsert: true }
      )
      → inserted++ | updated++ | skipped++
        │
        ▼
  Append { brand, inserted, updated, skipped, failed, strategy } to brandResults
        │
        ▼
Aggregate total stats
Update ScraperLog {
  status: "completed" | "partial" | "failed",
  stats, brandResults, durationMs, completedAt
}
        │
        ▼
Winston logs flushed
```

---

## 8. Security Analysis

### Implemented Controls

| Control | Implementation | Assessment |
|---------|---------------|-----------|
| Password hashing | bcryptjs, 10 salt rounds | Strong |
| Token authentication | JWT HS256, 30-day expiry | Adequate |
| Role-based access | `adminOnly` middleware | Good |
| Rate limiting | 300/15min global, 20/15min auth | Good |
| Security headers | Helmet (CSP, HSTS, nosniff, X-Frame-Options) | Strong |
| CORS policy | Origin restricted to `FRONTEND_URL` | Good |
| Schema validation | Mongoose model constraints | Moderate |
| NoSQL injection | No raw user-constructed queries | Good |
| XSS | Next.js auto-escapes JSX output | Good |

### Vulnerabilities & Recommendations

**CRITICAL — Weak JWT Secret**  
Current `JWT_SECRET` value in `.env` is a human-readable string (`fashion_jwt_secret_change_in_production_2026`). This is predictable.  
Fix: `openssl rand -hex 32` → use output as `JWT_SECRET`.

**CRITICAL — Credentials in `.env`**  
The `.env` file contains live MongoDB credentials and a Gemini API key. If the repository is ever pushed to a public host (GitHub, etc.), these are immediately compromised.  
Fix: Add `.env` to `.gitignore`. Rotate all credentials. Use platform environment variables in production.

**HIGH — No Token Revocation**  
JWTs are stateless. Once issued, a 30-day token cannot be invalidated without changing `JWT_SECRET` (which invalidates all sessions). There is no blocklist/denylist.  
Fix: Implement short-lived access tokens (15 min) with refresh tokens stored in an httpOnly cookie.

**HIGH — No HTTPS on Backend**  
Backend runs on plain HTTP. JWT tokens and user credentials are transmitted in cleartext over the network.  
Fix: Terminate TLS at a reverse proxy (Nginx) or use a cloud platform (Railway, Render) that provides HTTPS automatically.

**MEDIUM — No Request Body Size Limit**  
Express is configured with `express.json()` but no `limit` option, making it possible to send very large payloads.  
Fix: `express.json({ limit: '10kb' })`

**MEDIUM — Admin Escalation on First Register**  
Any attacker who registers before the real admin could claim admin rights on a fresh deployment.  
Fix: Disable auto-admin after initial setup. Use an `ADMIN_SEED_EMAIL` env var approach.

**LOW — Token in localStorage**  
JWT stored in `localStorage` is accessible to JavaScript (XSS risk). In this app, Next.js mitigates most XSS but it's not zero-risk.  
Fix: Move to httpOnly cookie storage for the auth token.

---

## 9. Performance & Scalability Analysis

### Current Optimizations

| Area | Optimization | Impact |
|------|-------------|--------|
| DB queries | Compound indexes on filter fields | High |
| Pagination | 24/page default, max 48 | Medium |
| Scraper rate | `SCRAPER_DELAY_MS=1500` | Prevents IP bans |
| Search | MongoDB `$text` index | Medium |
| Images | Next.js `<Image>` lazy loading | Medium |
| Scraper volume | `SCRAPER_MAX_PER_BRAND=50` | Limits run time |

### Bottlenecks at Scale

**1. Sequential brand scraping**  
All 10 brand adapters run sequentially. With 50 products × 1.5s delay × multiple URL retries, a full run can take 15–25 minutes.  
Fix: Run brand adapters in parallel with `Promise.allSettled()`. Add a job queue (BullMQ + Redis) for distributed processing.

**2. No caching**  
Every request hits MongoDB. High-traffic endpoints (`/products/featured`, `/products/stats`) execute fresh queries on every page load.  
Fix: Redis cache with 5-minute TTL on featured and stats endpoints.

**3. Recommendation engine is O(n)**  
`GET /api/recommendations/:productId` scores every product in the complementary category. With 5,000+ products this becomes a multi-second query.  
Fix: Pre-compute and store top 10 recommendations per product in a `recommendations` field. Regenerate on each scrape.

**4. Embedding generation cost**  
Generating Gemini embeddings per product during scraping incurs API cost and latency. With 500 products per run, this is significant.  
Fix: Only generate embeddings for products with `metadataScore > 0.6`. Use a local sentence-transformer model for bulk embedding to eliminate API cost.

**5. No database connection pooling configuration**  
Mongoose uses default connection pool settings. Under load, connection exhaustion can occur.  
Fix: `mongoose.connect(uri, { maxPoolSize: 20 })` for production.

**6. No CDN for product images**  
Product images are served directly from brand websites. If a brand changes image URLs, `<Image>` components break.  
Fix: Download and host images in S3 + CloudFront during scraping.

---

## 10. Environment Configuration Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Production Value |
|----------|----------|---------|-----------------|
| `MONGO_URI` | Yes | — | MongoDB Atlas SRV connection string |
| `JWT_SECRET` | Yes | — | `openssl rand -hex 32` output |
| `PORT` | No | `5000` | As set by hosting platform |
| `NODE_ENV` | No | `development` | `production` |
| `FRONTEND_URL` | Yes | `http://localhost:3000` | `https://your-app.vercel.app` |
| `GEMINI_API_KEY` | Yes | — | From Google AI Studio |
| `SCRAPER_DRY_RUN` | No | `false` | `false` |
| `SCRAPER_MAX_PER_BRAND` | No | `50` | `200` (increase for full catalog) |
| `SCRAPER_DELAY_MS` | No | `1500` | `2000` (safer for production) |
| `SCRAPER_RETRY_LIMIT` | No | `3` | `3` |
| `SCRAPER_CRON_SCHEDULE` | No | `0 3 * * 0` | `0 3 * * 0` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Production Value |
|----------|----------|-----------------|
| `NEXT_PUBLIC_API_URL` | Yes | `https://your-api.railway.app/api` |

---

## 11. Setup & Deployment Guide

### Local Development

**Prerequisites:**
- Node.js v18+
- MongoDB (local) or MongoDB Atlas free tier
- Google Cloud project with Gemini API enabled

```bash
# 1. Install dependencies
cd AuraFit/backend && npm install
cd ../frontend && npm install

# 2. Configure backend
cd ../backend
cp .env.example .env
# Edit .env: set MONGO_URI, JWT_SECRET, GEMINI_API_KEY, FRONTEND_URL

# 3. Configure frontend
cd ../frontend
echo "NEXT_PUBLIC_API_URL=https://aurafit-8e3u.onrender.com/api" > .env.local

# 4. Start backend (port 5000)
cd ../backend && npm run dev

# 5. Start frontend (port 3000)
cd ../frontend && npm run dev

# 6. Populate database
cd ../backend
npm run scrape:dry   # Test first (no DB writes)
npm run scrape       # Real scrape
```

### Production Deployment

**Recommended platforms:**

| Component | Platform | Notes |
|-----------|---------|-------|
| Backend | Railway or Render | Node.js, set all env vars in dashboard |
| Frontend | Vercel | Optimized for Next.js, free tier available |
| Database | MongoDB Atlas | M10+ for production workloads |

**Production checklist:**

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` replaced with cryptographically random string
- [ ] `MONGO_URI` points to Atlas M10+ cluster
- [ ] `FRONTEND_URL` set to production Vercel domain
- [ ] `NEXT_PUBLIC_API_URL` set to production backend URL
- [ ] `.env` is in `.gitignore` (never committed)
- [ ] HTTPS verified (platform-provided or Nginx reverse proxy)
- [ ] `SCRAPER_DRY_RUN=false`
- [ ] PM2 or platform process manager configured for backend
- [ ] MongoDB Atlas IP allowlist configured

---

## 12. Known Issues & Recommendations

### Critical Priority

| Issue | Risk | Fix |
|-------|------|-----|
| Weak `JWT_SECRET` in `.env` | Token forgery | Replace with `openssl rand -hex 32` |
| Live credentials in `.env` | Credential leak if repo is public | Add to `.gitignore`, rotate all keys |

### High Priority

| Issue | Risk | Fix |
|-------|------|-----|
| No token revocation | Compromised tokens remain valid 30 days | Add refresh token + short-lived access token |
| No HTTPS on backend | JWT transmitted in cleartext | TLS via Nginx or cloud platform |
| Sequential scraping | 15–25 min run time, timeout risk | Parallelize brand adapters |
| No recommendation caching | Slow product detail pages at scale | Pre-compute top recommendations per product |

### Medium Priority

| Issue | Recommendation |
|-------|---------------|
| No request body size limit | `express.json({ limit: '10kb' })` |
| Images from brand CDNs can break | Download + host on S3/CloudFront |
| No email verification on register | Add email confirmation step |
| Embedding API cost at scale | Use local model or batch + cache |
| No test suite | Add unit tests for recommendation engine and color theory |

### Nice to Have

| Feature | Description |
|---------|-------------|
| Outfit history | Save AI chat results to user profile |
| Price drop alerts | Notify when favorited item goes on sale |
| Urdu language support | Localization for Pakistani market |
| PWA / offline mode | Service worker for offline product browsing |
| Social sharing | Share outfit links with preview cards |

---

## 13. Project Metrics Summary

### Codebase Inventory

| Layer | Files | Key Entities |
|-------|-------|-------------|
| Backend models | 5 | User, Product, Outfit, Favorite, ScraperLog |
| API route files | 6 | auth, products, recommendations, search, favorites, admin |
| Service files | 2 | recommendationEngine, colorTheory |
| Brand adapters | 10 | One per Pakistani brand |
| Scraper utilities | 7 | orchestrator, extractor ×2, parser, colorInference, requestUtils, logger |
| Config files | 2 | clothingBrands, shoeBrands |
| Frontend pages | 9 | Home, Discover, Search, Product, Favorites, Login, Register, Admin, Categories |
| Frontend components | 4 | Navbar, ProductCard, ChatBox, RecommendationResult |
| Context + lib | 2 | AuthContext, api.ts |

### API Surface

| Scope | Count |
|-------|-------|
| Public endpoints | 9 |
| User-authenticated endpoints | 4 |
| Admin-only endpoints | 5 |
| **Total endpoints** | **18** |

### Data Scale (Full Production Scrape)

| Metric | Estimated Value |
|--------|----------------|
| Brands covered | 10 |
| Products per full scrape (max) | 500 (10 × 50) |
| Products with full catalog | 2,000–5,000 |
| Scrape frequency | Weekly (Sunday 3 AM PKT) |
| Categories | 3 (clothing, shoes, accessories) |
| Occasions modeled | 8+ |
| Canonical colors | 15 (Black, White, Grey, Red, Pink, Purple, Blue, Green, Teal, Yellow, Orange, Gold, Beige, Brown, Multicolor) |
| Color aliases in normalization map | 180+ (including Pakistani Urdu terms) |

### Scoring Weights Summary

| Factor | Weight | Method |
|--------|--------|--------|
| Embedding similarity | 50% | Cosine similarity |
| Color compatibility | 20% | 14×14 lookup matrix |
| Occasion match | 20% | Jaccard index |
| Style match | 10% | Jaccard index |
| **Total** | **100%** | |

---

*Report generated: May 10, 2026*  
*Project: AuraFit — AI-Powered Pakistani Fashion Platform*  
*Working directory: `AuraFit/`*
