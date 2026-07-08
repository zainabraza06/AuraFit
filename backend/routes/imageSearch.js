import express from 'express';
import multer from 'multer';
import { searchByImage } from '../controllers/imageSearchController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/image', upload.single('image'), searchByImage);

export default router;
