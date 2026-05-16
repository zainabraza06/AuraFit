import express from 'express';
import { createEscalation } from '../controllers/adminController.js';

const router = express.Router();

router.post('/escalate', createEscalation);

export default router;
