import Product from '../models/Product.js';
import ScraperLog from '../models/ScraperLog.js';

let activeScrapePromise = null;
const sseClients = new Set();

export function broadcastScraperEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
}

export async function getStats(req, res) {
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
  } catch {
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
}

export async function getScraperLogs(req, res) {
  try {
    const { limit = 20 } = req.query;
    const logs = await ScraperLog.find()
      .sort({ startedAt: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json({ logs });
  } catch {
    res.status(500).json({ error: 'Failed to fetch scraper logs' });
  }
}

export async function getScraperStatus(req, res) {
  try {
    const latest = await ScraperLog.findOne().sort({ startedAt: -1 }).lean();
    res.json({
      isRunning: latest?.status === 'running',
      latest: latest || null
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch scraper status' });
  }
}

export function streamScraperEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE stream established' })}\n\n`);

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
}

export async function runScraper(req, res) {
  try {
    const running = await ScraperLog.findOne({ status: 'running' }).lean();
    if (running) {
      return res.status(409).json({ error: 'A scrape is already in progress', runId: running.runId });
    }

    res.json({ message: 'Scraper started', startedAt: new Date() });

    broadcastScraperEvent({ type: 'started', message: 'Scraper triggered by admin', timestamp: new Date() });

    if (!activeScrapePromise) {
      import('../scripts/scrapers/index.js').then(({ runScraper: execScraper }) => {
        activeScrapePromise = execScraper({ triggeredBy: 'admin' })
          .then((result) => {
            broadcastScraperEvent({ type: 'completed', message: 'Scrape completed successfully', stats: result });
          })
          .catch((err) => {
            broadcastScraperEvent({ type: 'error', message: err.message });
          })
          .finally(() => {
            activeScrapePromise = null;
          });
      });
    }
  } catch {
    res.status(500).json({ error: 'Failed to start scraper' });
  }
}

export async function deleteProductsByBrand(req, res) {
  try {
    const result = await Product.deleteMany({ brand: req.params.brand });
    res.json({ deleted: result.deletedCount, brand: req.params.brand });
  } catch {
    res.status(500).json({ error: 'Failed to delete brand products' });
  }
}
