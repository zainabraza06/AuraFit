import express from 'express';
import { semanticSearch, embedAll } from '../controllers/vectorSearchController.js';

const router = express.Router();

router.get('/semantic', semanticSearch);
router.post('/embed-all', embedAll);

export default router;
