import express from 'express';
import { protect } from '../middleware/auth.js';
import { register, login, getMe, changePassword } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

export default router;
