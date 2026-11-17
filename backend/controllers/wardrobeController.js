import { analyzeImageWithProviderFallback } from '../services/llmClient.js';
import WardrobeItem from '../models/WardrobeItem.js';

export async function addWardrobeItem(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please upload an image of your clothing' });

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

    // Goes through the shared vision chain (current Gemini models, circuit breaker, metrics) instead of a
    // hard-coded model id that had been retired.
    const { data: analysis } = await analyzeImageWithProviderFallback({
      prompt,
      imageBase64: req.file.buffer.toString('base64'),
      mimeType: req.file.mimetype
    });

    const wardrobeItem = await WardrobeItem.create({
      user: req.user._id,
      name: analysis.subCategory,
      category: analysis.category,
      subCategory: analysis.subCategory,
      primaryColor: analysis.primaryColor,
      tags: analysis.tags,
      imageUrl: 'https://via.placeholder.com/400x500?text=My+Wardrobe+Item'
    });

    res.status(201).json(wardrobeItem);
  } catch (err) {
    console.error('Wardrobe upload error:', err);
    res.status(500).json({ error: 'Failed to add item to wardrobe' });
  }
}

export async function getWardrobe(req, res) {
  const items = await WardrobeItem.find({ user: req.user._id });
  res.json(items);
}
