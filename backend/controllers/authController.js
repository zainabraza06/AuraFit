import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '../services/cloudinary.js';

function generateToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const user = await User.create({ name, email, password });

    // Optional profile picture uploaded with the registration form (multipart).
    if (req.file && isCloudinaryConfigured()) {
      try {
        const { url } = await uploadBufferToCloudinary(req.file.buffer, {
          folder: 'aurafit/avatars',
          publicId: `user_${user._id}`
        });
        user.profilePicture = url;
        await user.save();
      } catch (e) {
        // Non-fatal: account is created even if the avatar upload fails.
        console.warn('[register] avatar upload failed:', e.message);
      }
    }

    res.status(201).json({
      user: user.toJSON(),
      token: generateToken(user._id)
    });
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
}

/**
 * Upload or replace the current user's profile picture (protected).
 * Accepts a single `image` file (multipart/form-data).
 */
export async function updateProfilePicture(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please attach an image file' });
    }
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        error: 'Image hosting not configured',
        hint: 'Add CLOUDINARY_URL (or CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) to backend/.env'
      });
    }
    const { url } = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'aurafit/avatars',
      publicId: `user_${req.user._id}`
    });
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture: url },
      { new: true }
    ).select('-password');
    res.json({ user, profilePicture: url });
  } catch (err) {
    console.error('Profile picture upload error:', err);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
}

export async function login(req, res) {
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
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
}

export function getMe(req, res) {
  res.json({ user: req.user });
}

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
}
