import { GoogleGenerativeAI } from '@google/generative-ai';
import Product from '../models/Product.js';

export async function searchByImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      Analyze this fashion item.
      Identify its:
      - Category (Dress, Shoe, etc.)
      - Primary Color
      - Style (Embroidered, Printed, Western, etc.)
      - Key features (V-neck, block heel, floral, etc.)

      Return ONLY a JSON object with:
      { "category": "...", "color": "...", "style": "...", "keywords": ["...", "..."] }
    `;

    const imageParts = [{
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype
      }
    }];

    const result = await model.generateContent([prompt, ...imageParts]);
    const analysis = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());

    const searchQuery = {
      $or: [
        { primaryColor: { $regex: analysis.color, $options: 'i' } },
        { name: { $regex: analysis.keywords[0], $options: 'i' } }
      ]
    };

    if (analysis.category) {
      searchQuery.category = analysis.category.toLowerCase().includes('shoe') ? 'shoes' : 'clothing';
    }

    const matches = await Product.find(searchQuery).limit(10).lean();

    res.json({
      analysis,
      matches,
      message: `Found ${matches.length} items matching your photo!`
    });
  } catch (err) {
    console.error('Image search error:', err);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
}
