import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import connectDB from './config/db.js';
import Product from './models/Product.js';
import authRoutes from './routes/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read from frontend .env.local
dotenv.config({ path: path.resolve(__dirname, '../frontend/.env.local') });

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

connectDB();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const prompt = `
      You are an AI fashion stylist for a Pakistani platform.
      Parse the following user request and extract their fashion intent as a JSON object.
      User Request: "${message}"
      Return ONLY a valid JSON object with:
      - color (string)
      - occasion (array of strings: ["casual", "wedding", "office", "party", "eid", "formal"])
      - style (array of strings)
      - maxBudget (number)
      - intentSummary (string, max 2 sentences)
    `;

    let parsedIntent;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.1 }
      });
      let responseText = response.text;
      console.log('Raw Gemini Text:', responseText);
      if (responseText.includes('```')) {
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      }
      parsedIntent = JSON.parse(responseText);
    } catch (apiErr) {
      console.error('Gemini API Error:', apiErr);
      parsedIntent = {
        color: 'Any', occasion: ['casual'], style: ['elegant'], maxBudget: 0,
        intentSummary: 'This is a beautiful and versatile look suited for your request.'
      };
    }

    const dressQuery = { category: 'Dress' };
    if (parsedIntent.color && parsedIntent.color.toLowerCase() !== 'any') {
      dressQuery.color = { $regex: new RegExp(parsedIntent.color, 'i') };
    }
    if (parsedIntent.occasion && parsedIntent.occasion.length > 0) {
      dressQuery.occasion = { $in: parsedIntent.occasion };
    }
    if (parsedIntent.maxBudget > 0) {
      dressQuery.price = { $lte: parsedIntent.maxBudget };
    }

    let dresses = await Product.aggregate([
      { $match: dressQuery },
      { $sample: { size: 8 } }
    ]);
    if (dresses.length === 0) dresses = await Product.aggregate([{ $match: { category: 'Dress' } }, { $sample: { size: 8 } }]);

    const bestDress = dresses[0];

    const shoeQuery = { category: 'Shoe' };
    if (bestDress?.occasion && bestDress.occasion.length > 0) shoeQuery.occasion = { $in: bestDress.occasion };
    let shoes = await Product.aggregate([
      { $match: shoeQuery },
      { $sample: { size: 5 } }
    ]);
    if (shoes.length === 0) shoes = await Product.aggregate([{ $match: { category: 'Shoe' } }, { $sample: { size: 5 } }]);

    const jewelQuery = { category: 'Jewelry' };
    if (bestDress?.occasion && bestDress.occasion.length > 0) jewelQuery.occasion = { $in: bestDress.occasion };
    let jewelry = await Product.aggregate([
      { $match: jewelQuery },
      { $sample: { size: 5 } }
    ]);
    if (jewelry.length === 0) jewelry = await Product.aggregate([{ $match: { category: 'Jewelry' } }, { $sample: { size: 5 } }]);

    res.json({
      intent: parsedIntent,
      outfit: { heroDress: bestDress || null, otherDresses: dresses.slice(1), shoes, jewelry }
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Failed to process fashion query' });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend Express server running on port ${PORT}`));
