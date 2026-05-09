# AuraFit — AI Fashion Stylist & Discovery Engine 👗✨

AuraFit is a premium MERN-stack application that serves as an intelligent fashion stylist for the Pakistani market. Using **Gemini 2.5 Flash**, it transforms natural language intent into professionally curated outfits, complete with real-time product discovery from top brands.

---

## 🌟 Key Features

### 🧠 Master Stylist AI
Beyond simple filters, AuraFit uses **Gemini 2.5 Flash** to act as a personal fashion consultant. 
- **Intelligent Curation**: The AI "judges" and ranks products based on visual harmony, color theory, and fabric compatibility.
- **Stylist Reasoning**: Every recommendation comes with professional fashion justification (e.g., *"The deep emerald silk provides a sophisticated base for a formal evening..."*).
- **Sister-Color Fallback**: Intelligently suggests complementary colors if your specific choice is out of stock.

### 📦 Robust Multi-Brand Scraper
A highly modular scraping engine that tracks **10 top Pakistani brands** daily.
- **Brands Covered**: Zellbury (Stitched & Unstitched), Beechtree, Limelight, Alkaram Studio, Gul Ahmed (Ideas), Stylo, ECS, Borjan, Ndure, and Hush Puppies.
- **Stock-Awareness**: Real-time verification ensures users only see products currently in stock.
- **Daily Automation**: Runs every night at 3:00 AM PKT via `node-cron`.

### 🎨 Premium UI/UX
- **MuseAI Interface**: A sleek, dark-mode-first design built with Next.js and Vanilla CSS.
- **AI Chatbot**: Instant outfit generation via natural language conversation.
- **Discovery Engine**: Interactive product cards with "Style Similar" capabilities.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16+, Javascript, Vanilla CSS (Premium Aethetics)
- **Backend**: Node.js, Express, MongoDB Atlas
- **AI Engine**: Google Gemini 2.5 Flash (via @google/generative-ai)
- **Scraper**: Cheerio & Shopify JSON API Strategies
- **Scheduler**: Node-cron (Daily 3 AM PKT)

---

## 🚀 Getting Started

### 1. Environment Setup
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
MONGO_URI=your_mongodb_atlas_uri
GEMINI_API_KEY=your_google_ai_studio_key
JWT_SECRET=your_secure_secret
SCRAPER_CRON_SCHEDULE=0 3 * * *
```

### 2. Installation
```bash
# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 3. Database Seeding (Scraper)
To populate your database with the latest fashion data:
```bash
cd backend
npm run scrape
```

### 4. Running Locally
```bash
# Start Backend
cd backend
npm run dev

# Start Frontend
cd frontend
npm run dev
```

---

## 📅 Automation & Maintenance
The scraper is scheduled to run **daily at 3:00 AM PKT**. You can monitor the performance and status of these runs via the `ScraperLog` collection in your MongoDB database.

---

## 📄 License
This project is developed for the **AI Fashion Stylist** initiative. All brand logos and product images are the property of their respective owners.

*Developed with ❤️ by the AuraFit Team.*
