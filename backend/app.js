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
import supportRoutes        from './routes/support.js';
import { getRedis }         from './config/redis.js';
import { httpMetrics, metricsHandler } from './observability/metrics.js';
import { RedisStore }       from 'rate-limit-redis';
import { requestLogger }    from './middleware/requestLogger.js';
import { currentPolicy }     from './services/memoryProfile.js';
import { createMcpRouter }  from './routes/mcp.js';
import { vectorSummary } from './services/atlasVector.js';
import { CATALOGS } from './services/crossCatalogSearch.js';
import stylistRoutes        from './routes/stylist.js';
import feedbackRoutes       from './routes/feedback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env by default, but never override already-set env vars (tests set theirs first).
dotenv.config({ path: path.resolve(__dirname, '.env') });

export function createApp() {
  const app = express();

  // Trust Render's reverse proxy so express-rate-limit can read X-Forwarded-For
  app.set('trust proxy', 1);

  // Prometheus: latency/count per route pattern, scraped from GET /metrics (token-protected if METRICS_TOKEN is set)
  app.use(httpMetrics);
  // Structured JSON access log + X-Request-Id (silent under test unless LOG_REQUESTS=true)
  if (process.env.NODE_ENV !== 'test' || process.env.LOG_REQUESTS === 'true') app.use(requestLogger());
  app.get('/metrics', metricsHandler);

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

  // Disable rate limiting in tests to keep smoke runs deterministic, and in `npm run load:api` (NODE_ENV=loadtest)
  // so the load test measures the app, not the limiter. There is deliberately no env flag that disables it in production.
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'loadtest') {
    // With REDIS_URL the counters are shared across API instances; otherwise per-process memory.
    const redis = getRedis();
    const store = (prefix) => redis
      ? { store: new RedisStore({ prefix, sendCommand: (...args) => redis.call(...args) }) }
      : {};

    const globalLimiter = rateLimit({
      ...store('rl:global:'),
      passOnStoreError: true, // Redis trouble must not take the API down
      windowMs: 15 * 60 * 1000,
      max: 300,
      message: { error: 'Too many requests, please try again later.' }
    });

    const authLimiter = rateLimit({
      ...store('rl:auth:'),
      passOnStoreError: true,
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
  app.use('/api/support', supportRoutes);
  app.use('/api/stylist', stylistRoutes);
  app.use('/api/feedback', feedbackRoutes);

  // MCP (Model Context Protocol) endpoint for external agents. Off unless MCP_TOKEN is set; bearer-token protected.
  if (process.env.MCP_TOKEN) app.use('/mcp', createMcpRouter());

  // Health check
  app.get('/api/health', async (req, res) => {
    const policy = currentPolicy();
    const vector = await vectorSummary(CATALOGS).catch(() => ({ backend: 'memory', indexed: [] }));
    res.json({
      status: 'ok', timestamp: new Date(), version: '1.0.0',
      // what search is doing on this host: "semantic" needs the local embedding model, which needs enough RAM
      search: policy.text ? 'semantic' : 'keyword',
      photoSearchVisual: policy.image,
      // where vectors are searched: Atlas Vector Search for the indexed catalogs, in-process for the rest
      vectorSearch: vector,
      memoryLimitMB: policy.limitMB,
      rssMB: Math.round(process.memoryUsage().rss / 1048576),
    });
  });

  // ─── 404 Handler ─────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  // ─── Global Error Handler ────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(JSON.stringify({ level: 'error', msg: 'unhandled_error', reqId: req.id, route: req.originalUrl?.split('?')[0], error: err.message, stack: process.env.NODE_ENV === 'production' ? undefined : err.stack }));
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
  });

  return app;
}
