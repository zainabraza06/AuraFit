/**
 * auth.js — Authentication Routes
 * POST /api/auth/register — create account
 * POST /api/auth/login    — get JWT token
 * GET  /api/auth/me       — get current user (protected)
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

function generateToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    // First user becomes admin
    const isFirstUser = (await User.countDocuments()) === 0;
    const user = await User.create({
      name,
      email,
      password,
      role: isFirstUser ? 'admin' : 'user'
    });

    res.status(201).json({
      user: user.toJSON(),
      token: generateToken(user._id)
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      user: user.toJSON(),
      token: generateToken(user._id)
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
