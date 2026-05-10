import express from 'express';
import multer from 'multer';
import { searchByImage } from '../controllers/imageSearchController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/image', upload.single('image'), searchByImage);

export default router;
