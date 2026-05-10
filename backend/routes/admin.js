import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  getStats,
  getScraperLogs,
  getScraperStatus,
  streamScraperEvents,
  runScraper,
  deleteProductsByBrand
} from '../controllers/adminController.js';

export { broadcastScraperEvent } from '../controllers/adminController.js';

const router = express.Router();

router.use(protect, adminOnly);

router.get('/stats', getStats);
router.get('/scraper/logs', getScraperLogs);
router.get('/scraper/status', getScraperStatus);
router.get('/scraper/stream', streamScraperEvents);
router.post('/scraper/run', runScraper);
router.delete('/products/brand/:brand', deleteProductsByBrand);

export default router;
