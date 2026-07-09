import express from 'express';
import multer from 'multer';
import { virtualTryon, virtualTryonMulti } from '../controllers/tryonController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', upload.fields([{ name: 'person', maxCount: 1 }, { name: 'clothing', maxCount: 1 }]), virtualTryon);

// 2-pass sequential try-on: top garment first, then bottom garment layered on top
router.post('/multi', upload.fields([
  { name: 'person',         maxCount: 1 },
  { name: 'clothingTop',    maxCount: 1 },
  { name: 'clothingBottom', maxCount: 1 }
]), virtualTryonMulti);

export default router;
