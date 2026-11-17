import express from 'express';
import { imageUpload, verifyImages, uploadErrorHandler } from '../middleware/uploads.js';
import { protect } from '../middleware/auth.js';
import { addWardrobeItem, getWardrobe } from '../controllers/wardrobeController.js';

const router = express.Router();
const upload = imageUpload({ maxBytes: 8 * 1024 * 1024, maxFiles: 1 }); // was unbounded

router.post('/', protect, upload.single('image'), verifyImages, addWardrobeItem);
router.get('/', protect, getWardrobe);

router.use(uploadErrorHandler);

export default router;
