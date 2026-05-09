/**
 * admin.js — Admin Dashboard API
 * All routes require admin role.
 * 
 * GET  /api/admin/stats           — product counts, brand breakdown
 * GET  /api/admin/scraper/logs    — recent scraper run logs
 * POST /api/admin/scraper/run     — trigger manual scrape
 * GET  /api/admin/scraper/status  — current run status
 */

import express from 'express';
import Product from '../models/Product.js';
import ScraperLog from '../models/ScraperLog.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();
router.use(protect, adminOnly);

// Track active scrape in memory (simple approach)
let activeScrapePromise = null;

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [total, byCategory, byBrand, recentCount, priceStats] = await Promise.all([
      Product.countDocuments(),
      Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Product.aggregate([
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Product.countDocuments({ scrapedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
      Product.aggregate([
        { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' }, avg: { $avg: '$price' } } }
      ])
    ]);

    res.json({
      total,
      byCategory: Object.fromEntries(byCategory.map((b) => [b._id, b.count])),
      byBrand,
      recentWeek: recentCount,
      priceRange: priceStats[0] || { min: 0, max: 0, avg: 0 }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// ─── GET /api/admin/scraper/logs ──────────────────────────────────────────────
router.get('/scraper/logs', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const logs = await ScraperLog.find()
      .sort({ startedAt: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scraper logs' });
  }
});

// ─── GET /api/admin/scraper/status ───────────────────────────────────────────
router.get('/scraper/status', async (req, res) => {
  try {
    const latest = await ScraperLog.findOne().sort({ startedAt: -1 }).lean();
    res.json({
      isRunning: latest?.status === 'running',
      latest: latest || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scraper status' });
  }
});

// ─── POST /api/admin/scraper/run ──────────────────────────────────────────────
router.post('/scraper/run', async (req, res) => {
  try {
    // Check if already running
    const running = await ScraperLog.findOne({ status: 'running' }).lean();
    if (running) {
      return res.status(409).json({ error: 'A scrape is already in progress', runId: running.runId });
    }

    // Respond immediately — scraper runs in background
    res.json({ message: 'Scraper started', startedAt: new Date() });

    // Import and run asynchronously (don't await in request handler)
    if (!activeScrapePromise) {
      import('../scripts/scrapers/index.js').then(({ runScraper }) => {
        activeScrapePromise = runScraper({ triggeredBy: 'admin' }).finally(() => {
          activeScrapePromise = null;
        });
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to start scraper' });
  }
});

// ─── DELETE /api/admin/products/brand/:brand ──────────────────────────────────
// Utility: remove all products from a specific brand (for re-scraping)
router.delete('/products/brand/:brand', async (req, res) => {
  try {
    const result = await Product.deleteMany({ brand: req.params.brand });
    res.json({ deleted: result.deletedCount, brand: req.params.brand });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete brand products' });
  }
});

export default router;
