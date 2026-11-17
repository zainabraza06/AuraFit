import express from 'express';
import { imageUpload, verifyImages, uploadErrorHandler } from '../middleware/uploads.js';
import { quota } from '../middleware/quota.js';
import { searchByImage, refineVisualSearch } from '../controllers/imageSearchController.js';

const router = express.Router();
const upload = imageUpload({ maxBytes: 5 * 1024 * 1024, maxFiles: 1 });
const imageQuota = quota({ name: 'image-search', limit: Number(process.env.IMAGE_SEARCH_DAILY_LIMIT || 100), anonymousLimit: Number(process.env.IMAGE_SEARCH_ANON_DAILY_LIMIT || 20), windowMs: 24 * 3600 * 1000 });

router.post('/image', imageQuota, upload.single('image'), verifyImages, searchByImage);
router.post('/refine', imageQuota, refineVisualSearch);

router.use(uploadErrorHandler);

export default router;
