import express from 'express';
import { search, getSuggestions } from '../controllers/searchController.js';
import { cacheResponse } from '../middleware/cache.js';

const router = express.Router();

// Keyword search fans out to four catalogs; popular queries repeat, and a catalog only changes weekly.
// 30 s keeps results fresh enough while sparing the database (Redis if configured, otherwise in-process with coalescing).
router.get('/', cacheResponse(30), search);
router.get('/suggestions', cacheResponse(60), getSuggestions);

export default router;
