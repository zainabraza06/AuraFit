import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { addWardrobeItem, getWardrobe } from '../controllers/wardrobeController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', protect, upload.single('image'), addWardrobeItem);
router.get('/', protect, getWardrobe);

export default router;
