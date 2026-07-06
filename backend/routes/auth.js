import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { register, login, getMe, changePassword, updateProfilePicture } from '../controllers/authController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// `upload.single('image')` is optional here — registration works with or without a picture.
router.post('/register', upload.single('image'), register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);
router.put('/profile-picture', protect, upload.single('image'), updateProfilePicture);

export default router;
