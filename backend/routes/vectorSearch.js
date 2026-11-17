import express from 'express';
import { semanticSearch, embedAll } from '../controllers/vectorSearchController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.get('/semantic', semanticSearch);
// Re-embeds the whole catalog (minutes of CPU): admin only. It used to be open to anyone.
router.post('/embed-all', protect, adminOnly, embedAll);

export default router;
