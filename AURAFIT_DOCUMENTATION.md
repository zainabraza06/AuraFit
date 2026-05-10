# AuraFit — Complete Technical Documentation

> AI-powered Pakistani fashion discovery platform. Real products. Real brands. Intelligent curation.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Scraper System](#4-scraper-system)
5. [AI Recommendation Engine](#5-ai-recommendation-engine)
6. [API Reference](#6-api-reference)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Data Model](#8-data-model)
9. [Color Theory Engine](#9-color-theory-engine)
10. [Authentication & Security](#10-authentication--security)
11. [Feature Flow Diagrams](#11-feature-flow-diagrams)
12. [Deployment & Environment](#12-deployment--environment)

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│              Next.js 16 App (React 19 + TypeScript)                 │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS / Axios (JWT Bearer)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXPRESS BACKEND (Node.js)                      │
│   /api/products  /api/recommendations  /api/search  /api/auth       │
│                                                                     │
│   Routes (thin) ──► Controllers (logic) ──► Services               │
└──────────┬──────────────────────────────────────┬───────────────────┘
           │ Mongoose ODM                          │ @google/generative-ai
           ▼                                       ▼
┌──────────────────────┐               ┌──────────────────────────────┐
│   MongoDB Atlas       │               │  Multi-Provider AI Chain     │
│  (Product, User,      │               │  Gemini 2.5 Flash (primary)  │
│   Favorite, Outfit,   │               │  Groq Llama 3.1 (fallback)   │
│   ScraperLog)         │               │  OpenRouter Gemma (fallback) │
└──────────────────────┘               │  Gemini 1.5 Flash (final)    │
                                       └──────────────────────────────┘

Separate async process:
┌───────────────────────────────────────────────────────────────────┐
│                     SCRAPER SYSTEM (node-cron)                    │
│  Orchestrator → Brand Adapters → Extractors → Parser → MongoDB   │
│                                                                   │
│  Clothing: Beechtree, Limelight, Zellbury, Alkaram, Gul Ahmed    │
│  Shoes:    Stylo, ECS, Borjan, Hush Puppies, Ndure               │
└───────────────────────────────────────────────────────────────────┘
```

### Layering

```
Routes         routes/*.js              (HTTP wiring only — no logic)
    │
Controllers    controllers/*.js         (request validation, response shaping)
    │
Services       services/                (business logic, DB queries, AI calls)
    │
Models         models/*.js              (Mongoose schemas + indexes)
    │
MongoDB        Atlas or local
```

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16, React 19, TypeScript | App Router SSR/CSR hybrid |
| Styling | Vanilla CSS design system | Editorial charcoal + gold theme |
| HTTP Client | Axios | Typed API calls with JWT interceptor |
| Backend | Node.js 20 + Express 4 (ESM) | REST API server |
| Database | MongoDB Atlas + Mongoose 8 | Product/User storage |
| AI Primary | Google Gemini 2.5 Flash | Intent parsing + product ranking |
| AI Fallback 1 | Groq (Llama 3.1 8B) | Intent parsing fallback |
| AI Fallback 2 | OpenRouter (Gemma 2 9B) | Intent parsing fallback |
| AI Fallback 3 | Google Gemini 1.5 Flash | Intent parsing final fallback |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` | Semantic similarity vectors |
| Virtual Try-On | Replicate IDM-VTON | Before/after garment try-on |
| Scraping | Axios + Cheerio | Multi-strategy HTML/JSON extraction |
| Scheduling | node-cron | Weekly auto-scrape |
| Auth | JWT + bcryptjs | Stateless authentication |
| Security | Helmet, CORS, express-rate-limit | API hardening |

---

## 3. Project Structure

```
AuraFit/
├── backend/
│   ├── config/
│   │   └── db.js                         # MongoDB Atlas connection
│   ├── middleware/
│   │   └── auth.js                       # JWT verification + role guard
│   ├── models/
│   │   ├── Product.js                    # Core unified product schema
│   │   ├── User.js                       # User accounts + preferences
│   │   ├── Outfit.js                     # Saved outfit combinations
│   │   ├── Favorite.js                   # User-product join table
│   │   └── ScraperLog.js                 # Scrape run audit logs
│   ├── controllers/
│   │   ├── recommendationsController.js  # Intent parsing + outfit generation
│   │   ├── productsController.js         # Product CRUD + featured
│   │   ├── authController.js             # Login / register / me
│   │   ├── searchController.js           # Full-text + fallback search
│   │   ├── favoritesController.js        # Toggle / list favorites
│   │   ├── adminController.js            # Stats + scraper control
│   │   ├── vectorSearchController.js     # HuggingFace semantic search
│   │   ├── imageSearchController.js      # Gemini visual search
│   │   ├── tryonController.js            # Replicate IDM-VTON
│   │   ├── wardrobeController.js         # User wardrobe management
│   │   └── outfitsController.js          # Saved outfit boards
│   ├── routes/
│   │   ├── auth.js                       # → authController
│   │   ├── products.js                   # → productsController
│   │   ├── recommendations.js            # → recommendationsController
│   │   ├── search.js                     # → searchController
│   │   ├── favorites.js                  # → favoritesController
│   │   └── admin.js                      # → adminController
│   ├── services/
│   │   ├── recommendationEngine.js       # Progressive relaxation + shoe matching
│   │   ├── aiService.js                  # rankProductsWithAI + multi-provider intent
│   │   └── colorTheory.js                # 15-color compatibility matrix
│   ├── jobs/
│   │   └── scraperJob.js                 # node-cron weekly scheduler
│   ├── scripts/scrapers/
│   │   ├── index.js                      # Orchestrator
│   │   ├── scraper.js                    # Core HTTP + extraction loop
│   │   ├── adapters/                     # Brand-specific config (10 adapters)
│   │   ├── extractors/
│   │   │   ├── shopifyExtractor.js       # /products.json strategy
│   │   │   └── htmlExtractor.js          # Cheerio HTML strategy
│   │   ├── parsers/
│   │   │   └── productParser.js          # Raw → normalized Product
│   │   └── utils/
│   │       ├── colorInference.js         # Returns exact + canonical colors
│   │       ├── requestUtils.js           # Axios + retry
│   │       └── logger.js                 # Winston
│   └── server.js                         # Express bootstrap
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx                  # Home + AI chat + featured grid
    │   │   ├── discover/page.tsx         # Product browser + filters
    │   │   ├── search/page.tsx           # Search page
    │   │   ├── product/[id]/page.tsx     # Product detail + recommendations
    │   │   ├── favorites/page.tsx        # Saved items
    │   │   ├── admin/page.tsx            # Admin dashboard
    │   │   └── globals.css               # Design tokens + components
    │   ├── components/
    │   │   ├── Navbar.tsx
    │   │   ├── ProductCard.tsx
    │   │   ├── ChatWidget.tsx            # Floating AI side-panel
    │   │   └── RecommendationResult.tsx  # Outfit results (compact + full)
    │   ├── context/AuthContext.tsx
    │   └── lib/api.ts                    # Axios instance + API helpers
    └── package.json
```

---

## 4. Scraper System

### Extraction Strategy (3-tier waterfall)

```
Brand URL
    │
    ├─► Strategy 1: /products.json?limit=250&page=N   (Shopify JSON)
    │       Most reliable; used for all Shopify stores
    │
    ├─► Strategy 2: site-wide listing crawl
    │       Fallback when JSON API is rate-limited or blocked
    │
    └─► Strategy 3: Cheerio HTML parsing
            Brand-specific CSS selectors per adapter
```

### Product Normalization (`productParser.js`)

```
raw product (name, description, price, images, tags)
    │
    ├── inferCategory()          clothing / shoes / accessories
    ├── inferStitching()         subCategory prefix: "unstitched" → 'unstitched'
    ├── inferDressStyle()        DRESS_STYLE_MAP keyword lookup
    │                            → saree | lehenga | frock | maxi | shalwar-kameez
    │                              kurta | co-ord | palazzo | western
    ├── inferPrint()             keyword lists
    │                            → embroidered | printed | plain | embellished | mixed
    ├── inferPieces()            regex: "2 piece / do piece / 2-piece" → 2
    │                                   "3 piece / teen piece" → 3
    │                                   "kurta / shirt" alone → 1
    ├── inferColors()            returns BOTH:
    │                            • primaryExactColor / exactColors  (scraped shade)
    │                            • primaryColor / colors            (canonical family)
    ├── parsePrice()             strips PKR/Rs, commas → Number
    └── upsert to MongoDB        by productUrl (unique key)
```

### Color Storage — Dual Fields

| Field | Example | Purpose |
|-------|---------|---------|
| `primaryExactColor` | `"maroon"` | Exact scraped shade (new — for exact matching) |
| `exactColors` | `["maroon", "golden"]` | All exact shades |
| `primaryColor` | `"Red"` | Canonical family (unchanged — for fallback matching) |
| `colors` | `["Red", "Gold"]` | All canonical families |

### Covered Brands

| Brand | Category | Strategy |
|-------|----------|----------|
| Zellburry | Clothing | Shopify JSON |
| Beechtree | Clothing | Shopify JSON |
| Limelight | Clothing | Shopify JSON |
| Alkaram | Clothing | Shopify JSON |
| Gul Ahmed | Clothing | Shopify JSON |
| Stylo | Shoes | HTML / Shopify |
| ECS | Shoes | Shopify JSON |
| Borjan | Shoes | Shopify JSON |
| Hush Puppies | Shoes | HTML |
| Ndure | Shoes | Shopify JSON |

---

## 5. AI Recommendation Engine

### "Style Me" End-to-End Flow

```
User types: "maroon unstitched 3-piece embroidered for wedding under 10000"
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. INTENT PARSING  (aiService.parseIntentWithFallback)         │
│                                                                 │
│  Primary:  Gemini 2.5 Flash                                     │
│  Fallback: Groq Llama 3.1 → OpenRouter Gemma 2 → Gemini 1.5   │
│                                                                 │
│  Output:                                                        │
│    colorExact:  "maroon"        colorFamily: "Red"              │
│    stitching:   "unstitched"    pieces:      3                  │
│    print:       "embroidered"   occasion:    ["wedding"]        │
│    maxBudget:   10000           dressStyle:  null               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. PROGRESSIVE CONSTRAINT RELAXATION                           │
│     (recommendationEngine.fetchCandidates)                      │
│                                                                 │
│  Only specified fields become DB filters.                       │
│  Relaxation order (one dropped per level):                      │
│                                                                 │
│  Level 0: occasion + print + stitching + pieces + exact color   │
│  Level 1: drop occasion                                         │
│  Level 2: drop print                                            │
│  Level 3: drop dressStyle (if specified)                        │
│  Level 4: drop stitching                                        │
│  Level 5: drop pieces                                           │
│  Level 6: drop fabric (if specified)                            │
│  Level 7: exact color → canonical family                        │
│  Level 8: drop color                                            │
│                                                                 │
│  Stops when pool ≥ 50 products. DB query limit: 100/level.      │
│  Dropped fields → relaxationMessage shown to user.              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. AI RANKING  (aiService.rankProductsWithAI)                  │
│                                                                 │
│  Top 50 candidates sent to Gemini 2.5 Flash with:              │
│    - Full product metadata per item                             │
│    - First 300 chars of description                             │
│    - User's original message + parsed intent                    │
│                                                                 │
│  Gemini returns:                                                │
│    - Ranked order (1 = best match)                              │
│    - One-sentence match reason per product                      │
│                                                                 │
│  Top 10 taken forward.                                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. SHOE MATCHING  (matchShoesForProducts)                      │
│                                                                 │
│  For each of the top 10 dresses, scores all shoes in DB:        │
│                                                                 │
│  score = embedding×0.50 + colorTheory×0.20 +                   │
│          occasionOverlap×0.20 + styleOverlap×0.10              │
│                                                                 │
│  Best-scoring shoe picked per dress.                            │
│  generateShoeMatchReason() produces human-readable reason.      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. RESPONSE                                                    │
│                                                                 │
│  results: [10 × { product, rank, matchReason, shoe }]           │
│  matchQuality: { tier, totalFound, message }                    │
│  relaxationMessage: string | null                               │
└─────────────────────────────────────────────────────────────────┘
```

### Match Quality Tiers

| Tier | Condition | Meaning |
|------|-----------|---------|
| `exact` | No constraints dropped | All specified criteria met |
| `close` | ≥8 results after relaxation | Very close match |
| `similar` | ≥4 results | Partial match |
| `loose` | <4 results | Broadly related |

### Multi-Provider AI Fallback

```
parseIntentWithFallback(message, prompt)
    │
    ├─► Gemini 2.5 Flash       (primary — JSON mode, temp 0.1)
    │       ✓ on success → return
    │       ✗ on failure ↓
    │
    ├─► Groq Llama 3.1 8B      (fallback 1 — if GROQ_API_KEY set)
    │       ✓ on success → return
    │       ✗ on failure ↓
    │
    ├─► OpenRouter Gemma 2 9B  (fallback 2 — if OPENROUTER_API_KEY set)
    │       ✓ on success → return
    │       ✗ on failure ↓
    │
    └─► Gemini 1.5 Flash       (final fallback)
            ✓ on success → return
            ✗ throw "All AI providers exhausted"
```

### Intent Schema

The structured object extracted from every user message:

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `colorExact` | string\|null | `"maroon"` | Exact word user said |
| `colorFamily` | string | `"Red"` | Canonical family from 15-color list |
| `occasion` | string[] | `["wedding"]` | Empty `[]` if not mentioned |
| `dressStyle` | string\|null | `"lehenga"` | One of 9 dress styles |
| `stitching` | string\|null | `"unstitched"` | null if not mentioned |
| `pieces` | number\|null | `3` | 1/2/3 or null |
| `print` | string\|null | `"embroidered"` | embroidered/printed/plain/embellished |
| `fabric` | string\|null | `"lawn"` | null if not mentioned |
| `gender` | string | `"women"` | Default: women |
| `maxBudget` | number | `10000` | 0 if not mentioned |
| `intentSummary` | string | `"..."` | One-sentence summary |
| `aiAnalysis` | string | `"..."` | 2-3 sentences fashion advice |

**Key principle:** Only fields the user explicitly mentioned are used as DB filters. Unspecified fields are never filtered.

---

## 6. API Reference

### POST `/api/recommendations/outfit`

**Request:**
```json
{ "message": "ferozi unstitched lawn 2-piece for Eid" }
```

**Response:**
```json
{
  "intent": {
    "colorExact": "ferozi",
    "colorFamily": "Teal",
    "stitching": "unstitched",
    "pieces": 2,
    "fabric": "lawn",
    "occasion": ["eid"],
    "dressStyle": null,
    "print": null,
    "maxBudget": 0,
    "intentSummary": "An unstitched ferozi lawn 2-piece suit for Eid.",
    "aiAnalysis": "Ferozi is a beloved Eid color..."
  },
  "results": [
    {
      "product": {
        "_id": "...", "name": "Ferozi Lawn 2-Piece",
        "brand": "Gul Ahmed", "price": 5500,
        "primaryExactColor": "ferozi", "primaryColor": "Teal",
        "stitching": "unstitched", "pieces": 2, "fabric": "lawn",
        "occasion": ["eid", "casual"], "dressStyle": "shalwar-kameez",
        "print": "printed", "imageUrl": "...", "productUrl": "..."
      },
      "rank": 1,
      "matchReason": "Exact ferozi unstitched lawn 2-piece — perfect Eid suit.",
      "shoe": {
        "product": { "_id": "...", "name": "...", "price": 3200, ... },
        "score": 0.84,
        "reason": "teal pairs with ferozi · both eid appropriate"
      }
    }
  ],
  "matchQuality": { "tier": "exact", "totalFound": 18, "message": null },
  "relaxationMessage": null
}
```

### GET `/api/recommendations/:productId`

Returns complementary clothing and shoes for a given product. Used on product detail pages.

```json
{
  "source": { ...product },
  "shoes": [ { "product": {...}, "scores": { "total": 0.91, ... } } ],
  "complementaryClothing": [ { "product": {...}, "scores": {...} } ],
  "generatedAt": "2026-05-10T..."
}
```

### GET `/api/products`

**Query params:**
| Param | Description |
|-------|-------------|
| `category` | `clothing` \| `shoes` \| `accessories` |
| `brand` | Brand name filter |
| `color` | Canonical color filter |
| `occasion` | Occasion filter |
| `minPrice` / `maxPrice` | Price range in PKR |
| `search` | Full-text search term |
| `page` | Page number (default 1) |
| `limit` | Results per page (max 48, default 24) |
| `sort` | `price_asc` \| `price_desc` \| `newest` \| `name` |

### Full API Table

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Get JWT token |
| GET | `/api/auth/me` | JWT | Current user |
| GET | `/api/products` | — | Paginated product list |
| GET | `/api/products/featured` | — | 10 random products |
| GET | `/api/products/stats` | — | DB counts by brand/category |
| GET | `/api/products/:id` | — | Single product |
| GET | `/api/recommendations/:productId` | — | Product-page outfit suggestions |
| POST | `/api/recommendations/outfit` | — | Chat-based outfit builder |
| GET | `/api/search` | — | Full-text search |
| GET | `/api/search/suggestions` | — | Autocomplete (top 5) |
| GET | `/api/favorites` | JWT | User's saved products |
| POST | `/api/favorites/:productId` | JWT | Toggle favorite |
| GET | `/api/favorites/check/:productId` | JWT | `{ isFavorited }` |
| DELETE | `/api/favorites/:productId` | JWT | Remove favorite |
| GET | `/api/admin/stats` | Admin | Dashboard stats |
| GET | `/api/admin/scraper/logs` | Admin | Last 20 run logs |
| GET | `/api/admin/scraper/status` | Admin | Running/idle status |
| POST | `/api/admin/scraper/run` | Admin | Trigger async scrape |
| DELETE | `/api/admin/products/brand/:brand` | Admin | Delete brand's products |
| PUT | `/api/admin/auth/change-password` | Admin | Change admin password |

---

## 7. Frontend Architecture

### Key Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Hero section, AI chat widget, featured products grid |
| Discover | `/discover` | Full product browser with category/brand/color/price/occasion filters |
| Search | `/search` | Full-text search with autocomplete |
| Product | `/product/[id]` | Product detail, image gallery, AI outfit recommendations |
| Favorites | `/favorites` | User-saved items (requires login) |
| Admin | `/admin` | Dashboard: scraper control, stats, logs |

### Key Components

**`ChatWidget.tsx`** — Floating side-panel AI stylist
- Maintains message history (`Msg[]`)
- Calls `recommendationsApi.outfit(message)` on submit
- Checks `res.data.results?.length` for success
- Renders `<RecommendationResult data={res.data} compact />` per AI response

**`RecommendationResult.tsx`** — Dual-mode outfit result renderer

*Compact mode* (ChatWidget sidebar):
- Top result product card (image, brand, name, price, dressStyle+stitching chips)
- `matchReason` italic quote
- Paired shoe inline card with reason

*Full mode* (Home page):
- Stylist's Vision banner with all intent chips: colorExact, colorFamily, dressStyle (purple), print (amber), stitching (green), pieces (teal), occasion[], fabric, maxBudget
- Relaxation message banner
- Hero card (#1): large image + `CategoryChips` + match reason + inline shoe + Shop button
- Results grid (#2–N): rank badge overlay, chips, 2-line match reason, compact shoe card, Shop button

**`CategoryChips`** — Shared chip renderer per product:
- Color chip (gold): `primaryExactColor (primaryColor)` if they differ
- dressStyle (purple), print (amber), stitching (green), pieces (teal), occasion, fabric

### API Layer (`lib/api.ts`)

```typescript
const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL });

// JWT interceptor — attaches token on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const recommendationsApi = {
  outfit: (message: string) =>
    api.post('/recommendations/outfit', { message }),
  getForProduct: (productId: string) =>
    api.get(`/recommendations/${productId}`),
};
```

---

## 8. Data Model

### Product Schema (full)

```javascript
{
  // Core identity
  name:               String,   // required
  brand:              String,   // required
  category:           String,   // 'clothing' | 'shoes' | 'accessories'
  subCategory:        String,   // e.g. 'stitched', 'unstitched', 'heels'

  // Clothing-specific attributes (new)
  dressStyle:         String,   // 'saree'|'lehenga'|'frock'|'maxi'|'shalwar-kameez'|
                                // 'kurta'|'co-ord'|'palazzo'|'western'
  stitching:          String,   // 'stitched' | 'unstitched'
  print:              String,   // 'embroidered'|'printed'|'plain'|'embellished'|'mixed'
  pieces:             Number,   // 1 | 2 | 3

  // Color — dual storage
  primaryExactColor:  String,   // exact scraped shade, e.g. "maroon"
  exactColors:        [String], // all exact shades, e.g. ["maroon", "golden"]
  primaryColor:       String,   // canonical family, e.g. "Red"
  colors:             [String], // all canonical families, e.g. ["Red", "Gold"]

  // Shared attributes
  fabric:             String,   // 'lawn' | 'chiffon' | 'silk' | 'velvet' ...
  occasion:           [String], // 'wedding'|'eid'|'casual'|'formal'|'party'|...
  style:              [String], // 'elegant'|'embroidered'|'traditional'|...
  gender:             String,   // 'women' | 'men' | 'kids' | 'unisex'
  price:              Number,   // PKR
  compareAtPrice:     Number,   // original price (sale items)
  fabric:             String,

  // Media & metadata
  imageUrl:           String,
  images:             [String],
  productUrl:         String,   // unique — upsert key
  description:        String,
  tags:               [String],
  embedding:          [Number], // HuggingFace semantic vector

  // System
  metadataScore:      Number,   // 0–1 data completeness
  createdAt:          Date,
  updatedAt:          Date
}
```

**Indexes:**
- `productUrl` — unique (upsert key)
- `brand + category`
- `primaryColor + category`
- `stitching + category` (new)
- `print + category` (new)
- `dressStyle + category` (new)
- `occasion`
- `price`
- Full-text on `name + description + tags`

---

## 9. Color Theory Engine

### 15 Canonical Colors

`Black, White, Grey, Red, Pink, Purple, Blue, Green, Teal, Yellow, Orange, Gold, Beige, Brown, Multicolor`

### Compatibility Matrix (selected values)

| Color A | Color B | Score | Note |
|---------|---------|-------|------|
| Black | Gold | 1.0 | Classic luxury |
| Black | White | 1.0 | Timeless contrast |
| White | Blue | 0.95 | Fresh and clean |
| Pink | White | 0.9 | Soft feminine |
| Beige | Brown | 0.85 | Earth tones |
| Red | Orange | 0.2 | Clashing warm |
| Purple | Orange | 0.3 | Low compatibility |

Neutral colors (Black, White, Grey, Gold, Beige, Brown, Multicolor) score ≥ 0.7 against any color.

### Alias Resolution (180+ aliases)

Urdu transliterations and shade names are resolved before lookup:

| Input | → Canonical |
|-------|-------------|
| ferozi / firozi | Teal |
| jamuni / baingan | Purple |
| gulabi | Pink |
| mehroon / mehrun / surkh / laal | Red |
| nila | Blue |
| narangi | Orange |
| zard / peela | Yellow |
| safed | White |
| dhani / mehendi / sabz | Green |
| maroon / crimson / burgundy / wine | Red |
| navy / cobalt / indigo | Blue |
| mustard / saffron / ochre | Yellow |
| ivory / cream / off-white | White |

### Exact Color Matching

When a user specifies `colorExact: "maroon"`, the DB query first attempts:
```js
exactColors: { $elemMatch: { $regex: /^maroon$/i } }
```
If too few results, it falls back to `primaryColor: "Red"` (canonical family), then finally drops the color filter entirely.

---

## 10. Authentication & Security

### JWT Flow

```
POST /api/auth/login { email, password }
    │
    ├── bcrypt.compare(password, user.passwordHash)
    ├── jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '30d' })
    └── return { token, user }

Subsequent requests:
    Authorization: Bearer <token>
    │
    └── auth middleware: jwt.verify → req.user = { id, role }
```

### Middleware Stack (per request)

```
Helmet (security headers)
    → CORS (FRONTEND_URL whitelist)
    → express-rate-limit (100 req/15min per IP)
    → express.json()
    → Route handlers
    → auth middleware (only on protected routes)
```

### Role-Based Access

| Role | Access |
|------|--------|
| Public | All `GET` product/search endpoints, `POST /outfit` |
| `user` | All public + favorites CRUD |
| `admin` | All user routes + admin dashboard + scraper control |

---

## 11. Feature Flow Diagrams

### "Style Me" Complete Flow

```
User input: "maroon unstitched embroidered 3-piece wedding suit"
                │
                ▼
INTENT PARSE (Gemini 2.5 Flash → fallback chain)
→ { colorExact:"maroon", stitching:"unstitched", print:"embroidered",
    pieces:3, occasion:["wedding"], colorFamily:"Red" }
                │
                ▼
BUILD DB QUERY (Level 0 — all constraints)
→ { category:'clothing', stitching:'unstitched', print:'embroidered',
    pieces:3, occasion:{$in:["wedding"]},
    exactColors:{ $elemMatch:{$regex:/^maroon$/i} } }
                │
                ├── if ≥50 results → proceed
                │
                ▼ else drop occasion (Level 1) → rebuild → try again
                    drop print (Level 2) → ...
                    drop stitching (Level 3) → ...
                    ... (Level 7: exact color → "Red")
                    ... (Level 8: no color filter)
                │
                ▼ first level with ≥50 products
RANK (Gemini reads top 50 full descriptions)
→ ranked [{ product, rank:1, reason:"..." }, ...]
                │
                ▼ take top 10
SHOE MATCH (score all shoes × each dress)
→ best shoe per dress
                │
                ▼
RESPONSE: results[10 × { product, rank, matchReason, shoe: {product, score, reason} }]
          + intent + matchQuality + relaxationMessage
```

### Scraper Flow

```
node-cron (Sunday 3 AM) or admin trigger
    │
    ▼
Orchestrator (scripts/scrapers/index.js)
    │
    ├── for each brand adapter:
    │       Strategy 1: GET /products.json
    │       (fail) → Strategy 2: site-wide crawl
    │       (fail) → Strategy 3: Cheerio HTML
    │
    ├── raw products → productParser.normalizeProduct()
    │       infer: stitching, dressStyle, print, pieces
    │       infer colors: exact + canonical (dual storage)
    │
    └── Product.bulkWrite (upsert by productUrl)
            → ScraperLog.create (audit record)
```

---

## 12. Deployment & Environment

### Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Long random secret for JWT signing |
| `PORT` | No | `5000` | Express server port |
| `NODE_ENV` | No | `development` | `production` enables stricter CORS |
| `FRONTEND_URL` | Yes | — | CORS whitelist origin |
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |
| `GROQ_API_KEY` | No | — | Groq API key (AI fallback 1) |
| `OPENROUTER_API_KEY` | No | — | OpenRouter key (AI fallback 2) |
| `REPLICATE_API_KEY` | No | — | Replicate token (virtual try-on) |
| `HUGGINGFACE_API_KEY` | No | — | HuggingFace token (vector search) |
| `SCRAPER_DRY_RUN` | No | `false` | `true` = parse, no DB writes |
| `SCRAPER_MAX_PER_BRAND` | No | `50` | Products per brand per run |
| `SCRAPER_DELAY_MS` | No | `1500` | ms between HTTP requests |
| `SCRAPER_RETRY_LIMIT` | No | `3` | Max retries per request |
| `SCRAPER_CRON_SCHEDULE` | No | `0 3 * * 0` | Cron (default: Sunday 3 AM) |
| `ADMIN_EMAIL` | Yes | — | Admin seeder email |
| `ADMIN_PASSWORD` | Yes | — | Admin seeder password |

### Frontend Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL |

### NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node server.js` | Production server |
| `npm run dev` | `nodemon server.js` | Dev server (watch) |
| `npm run scrape` | Run all scrapers | Write to DB |
| `npm run scrape:dry` | Run all scrapers | No DB writes |
| `npm run seed:admin` | Create admin | Uses .env credentials |

---

*AuraFit — Built for the Pakistani Fashion Community*
