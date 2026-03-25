import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../frontend/.env.local') });
console.log('Key:', process.env.GEMINI_API_KEY ? 'Loaded' : 'Missing');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'hello',
    });
    console.log('Success:', response.text);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
