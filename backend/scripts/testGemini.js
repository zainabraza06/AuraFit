/**
 * testGemini.js
 * Quick test to verify the Gemini API key and fashion intent parsing.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.error('❌ Error: GEMINI_API_KEY is not set in backend/.env');
    return;
  }

  console.log('🚀 Testing Gemini API Connection...');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
      You are a fashion stylist. 
      Parse this request and return ONLY JSON: "I need a blue dress for a summer wedding under 10000 PKR"
      Format: { "color": string, "occasion": string[], "style": string[], "maxBudget": number }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('\n✅ Gemini Response:');
    console.log(text);
    console.log('\n✨ Gemini is working perfectly!');
  } catch (error) {
    console.error('\n❌ Gemini API Error:', error.message);
    if (error.message.includes('API_KEY_INVALID')) {
      console.error('👉 Your API key seems invalid. Please check it in Google AI Studio.');
    }
  }
}

testGemini();
