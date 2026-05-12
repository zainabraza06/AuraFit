import { GoogleGenerativeAI } from '@google/generative-ai';
import ClothingProduct from '../models/ClothingProduct.js';
import { formatClothingForApi } from '../services/productCompat.js';

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

    const kw0 = (analysis.keywords && analysis.keywords[0]) ? String(analysis.keywords[0]) : '';
    const searchQuery = {
      $or: [
        { primaryColor: { $regex: analysis.color, $options: 'i' } },
        ...(kw0 ? [{ name: { $regex: kw0, $options: 'i' } }] : [])
      ]
    };

    const raw = await ClothingProduct.find(searchQuery).limit(10).lean();
    const matches = raw.map(formatClothingForApi);

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
