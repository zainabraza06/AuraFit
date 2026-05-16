/**
 * app.js — Express app factory
 * Exported separately so tests can import the app without starting the server.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env by default, but never override already-set env vars (tests set theirs first).
dotenv.config({ path: path.resolve(__dirname, '.env') });

export function createApp() {
  const app = express();

  // Trust Render's reverse proxy so express-rate-limit can read X-Forwarded-For
  app.set('trust proxy', 1);

  // ─── Security Middleware ───────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );

  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );

  // Disable rate limiting in tests to keep smoke runs deterministic.
  if (process.env.NODE_ENV !== 'test') {
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      message: { error: 'Too many requests, please try again later.' }
    });

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      message: { error: 'Too many auth attempts, please wait.' }
    });

    app.use(globalLimiter);
    app.use('/api/auth', authLimiter);
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/outfits', outfitRoutes);
  app.use('/api/search/visual', imageSearchRoutes);
  app.use('/api/search', vectorSearchRoutes); // vector routes FIRST (/semantic, /embed-all)
  app.use('/api/wardrobe', wardrobeRoutes);
  app.use('/api/tryon', tryonRoutes);
  app.use('/api/search', searchRoutes); // text/regex fallback
  app.use('/api/favorites', favoriteRoutes);
  app.use('/api/admin', adminRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date(), version: '1.0.0' });
  });

  // ─── 404 Handler ─────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  // ─── Global Error Handler ────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
  });

  return app;
}
