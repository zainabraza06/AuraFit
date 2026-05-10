import express from 'express';
import multer from 'multer';
import { virtualTryon } from '../controllers/tryonController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', upload.fields([{ name: 'person', maxCount: 1 }, { name: 'clothing', maxCount: 1 }]), virtualTryon);

export default router;
