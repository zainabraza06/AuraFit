import express from 'express';
import { createEscalation } from '../controllers/adminController.js';
import { quota } from '../middleware/quota.js';

const router = express.Router();

// Writes to the database without a login: keep one visitor from flooding the admin inbox.
router.post('/escalate', quota({ name: 'support-escalate', limit: 10, anonymousLimit: 5, windowMs: 24 * 3600 * 1000 }), createEscalation);

export default router;
