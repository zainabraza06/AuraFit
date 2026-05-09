import express from 'express';
import Outfit from '../models/Outfit.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Save a complete curated outfit
// @route   POST /api/outfits
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { heroProductId, accessoryIds, reasoning, name, occasion } = req.body;

    const outfit = await Outfit.create({
      user: req.user._id,
      name: name || 'New Curated Fit',
      heroProduct: heroProductId,
      accessories: accessoryIds || [],
      stylistReasoning: reasoning,
      occasion: occasion || []
    });

    const populatedOutfit = await outfit.populate(['heroProduct', 'accessories']);
    res.status(201).json(populatedOutfit);
  } catch (err) {
    console.error('Error saving outfit:', err);
    res.status(500).json({ error: 'Failed to save outfit' });
  }
});

// @desc    Get all saved outfits for a user
// @route   GET /api/outfits
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const outfits = await Outfit.find({ user: req.user._id })
      .populate(['heroProduct', 'accessories'])
      .sort('-createdAt');
    res.json(outfits);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch outfits' });
  }
});

// @desc    Delete a saved outfit
// @route   DELETE /api/outfits/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const outfit = await Outfit.findOne({ _id: req.params.id, user: req.user._id });
    if (!outfit) return res.status(404).json({ error: 'Outfit not found' });

    await outfit.deleteOne();
    res.json({ message: 'Outfit removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete outfit' });
  }
});

export default router;
