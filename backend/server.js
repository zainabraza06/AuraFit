/**
 * server.js — Main Express Application
 * Clean architecture: middleware → routes → error handling
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import { startScraperJob } from './jobs/scraperJob.js';

// ─── Routes ───────────────────────────────────────────────────────────────────
import authRoutes           from './routes/auth.js';
import productRoutes        from './routes/products.js';
import recommendationRoutes from './routes/recommendations.js';
import searchRoutes         from './routes/search.js';
import favoriteRoutes       from './routes/favorites.js';
import adminRoutes          from './routes/admin.js';
import outfitRoutes         from './routes/outfits.js';
import imageSearchRoutes    from './routes/imageSearch.js';
import wardrobeRoutes       from './routes/wardrobe.js';
import tryonRoutes          from './routes/tryon.js';
import vectorSearchRoutes   from './routes/vectorSearch.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

// Global rate limiter: 300 requests per 15 minutes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later.' }
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please wait.' }
});

app.use(globalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',             authLimiter, authRoutes);
app.use('/api/products',         productRoutes);
app.use('/api/recommendations',  recommendationRoutes);
app.use('/api/outfits',          outfitRoutes);
app.use('/api/search/visual',    imageSearchRoutes);
app.use('/api/search',           vectorSearchRoutes); // vector routes FIRST (/semantic, /embed-all)
app.use('/api/wardrobe',         wardrobeRoutes);
app.use('/api/tryon',            tryonRoutes);
app.use('/api/search',           searchRoutes);       // text/regex fallback
app.use('/api/favorites',        favoriteRoutes);
app.use('/api/admin',            adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), version: '1.0.0' });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Fashion Stylist API running on http://localhost:${PORT}`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });

  // Start weekly scraper cron job
  startScraperJob();
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
