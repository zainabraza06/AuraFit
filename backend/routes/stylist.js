import express from 'express';
import { askStylist, validateAsk } from '../controllers/stylistController.js';
import { quota } from '../middleware/quota.js';

const router = express.Router();
const agentQuota = quota({
  name: 'stylist-agent',
  limit: Number(process.env.AGENT_DAILY_LIMIT || 30),
  anonymousLimit: Number(process.env.AGENT_ANON_DAILY_LIMIT || 5),
  windowMs: 24 * 3600 * 1000,
});

router.post('/ask', validateAsk, agentQuota, askStylist);

export default router;
