import express from 'express';
import rateLimit from 'express-rate-limit';
import { postFeedback } from '../controllers/feedbackController.js';

const router = express.Router();
// Cheap endpoint, but a clicky page can fire many: allow a generous burst, never unbounded.
const limiter = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many feedback events' } });

router.post('/', limiter, express.json({ limit: '8kb' }), postFeedback);

export default router;
