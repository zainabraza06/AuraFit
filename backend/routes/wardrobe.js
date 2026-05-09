import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import WardrobeItem from '../models/WardrobeItem.js';
import { protect } from '../middleware/auth.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// @desc    Add item to digital wardrobe with AI auto-tagging
// @route   POST /api/wardrobe
router.post('/', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please upload an image of your clothing' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 1. AI analyzes the user's own item
    const prompt = `
      Identify this piece of clothing.
      Return JSON:
      {
        "category": "clothing|shoes|accessories",
        "subCategory": "e.g. Kurta, Heels, Jeans",
        "primaryColor": "e.g. Navy Blue",
        "tags": ["casual", "minimal", etc.]
      }
    `;

    const imageParts = [{ inlineData: { data: req.file.buffer.toString("base64"), mimeType: req.file.mimetype } }];
    const result = await model.generateContent([prompt, ...imageParts]);
    const analysis = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());

    // 2. Save to wardrobe
    // In a real app, we'd save the image to S3/Cloudinary here. 
    // For now, we simulate with a data URL or a placeholder.
    const wardrobeItem = await WardrobeItem.create({
      user: req.user._id,
      name: analysis.subCategory,
      category: analysis.category,
      subCategory: analysis.subCategory,
      primaryColor: analysis.primaryColor,
      tags: analysis.tags,
      imageUrl: "https://via.placeholder.com/400x500?text=My+Wardrobe+Item" // Simulated image path
    });

    res.status(201).json(wardrobeItem);
  } catch (err) {
    console.error('Wardrobe upload error:', err);
    res.status(500).json({ error: 'Failed to add item to wardrobe' });
  }
});

// @desc    Get user's digital wardrobe
router.get('/', protect, async (req, res) => {
  const items = await WardrobeItem.find({ user: req.user._id });
  res.json(items);
});

export default router;
