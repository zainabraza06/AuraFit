import express from 'express';
import { imageUpload, verifyImages, uploadErrorHandler } from '../middleware/uploads.js';
import { protect } from '../middleware/auth.js';
import { register, login, getMe, changePassword, updateProfilePicture } from '../controllers/authController.js';

const router = express.Router();
const upload = imageUpload({ maxBytes: 5 * 1024 * 1024, maxFiles: 1 });

// `upload.single('image')` is optional here — registration works with or without a picture.
router.post('/register', upload.single('image'), verifyImages, register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);
router.put('/profile-picture', protect, upload.single('image'), verifyImages, updateProfilePicture);

router.use(uploadErrorHandler);

export default router;
