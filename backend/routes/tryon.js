import express from 'express';
import { imageUpload, verifyImages, uploadErrorHandler } from '../middleware/uploads.js';
import { quota } from '../middleware/quota.js';
import { virtualTryon, virtualTryonMulti } from '../controllers/tryonController.js';

const router = express.Router();
const upload = imageUpload({ maxBytes: 10 * 1024 * 1024, maxFiles: 3 });
// Generation costs real money: cap per day (anonymous callers get a smaller budget).
const tryonQuota = quota({ name: 'tryon', limit: Number(process.env.TRYON_DAILY_LIMIT || 20), anonymousLimit: Number(process.env.TRYON_ANON_DAILY_LIMIT || 3), windowMs: 24 * 3600 * 1000 });

router.post('/', tryonQuota, upload.fields([{ name: 'person', maxCount: 1 }, { name: 'clothing', maxCount: 1 }]), verifyImages, virtualTryon);

// 2-pass sequential try-on: top garment first, then bottom garment layered on top
router.post('/multi', tryonQuota, upload.fields([
  { name: 'person',         maxCount: 1 },
  { name: 'clothingTop',    maxCount: 1 },
  { name: 'clothingBottom', maxCount: 1 }
]), verifyImages, virtualTryonMulti);

router.use(uploadErrorHandler);

export default router;
