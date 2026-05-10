/**
 * testMultiAI.js
 * Verifies the multi-tier AI fallback system (Gemini -> Groq -> OpenRouter -> Gemini 1.5).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseIntentWithFallback } from '../services/aiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const testMultiAI = async () => {
  const userQuery = "I need a royal blue embroidered chiffon 3-piece for a party under 12000 PKR";
  const prompt = "Extract fashion intent as JSON: color, occasion, style, maxBudget, fabric, piece.";

  console.log('🚀 Testing Multi-Tier AI Fallback...');
  console.log(`👤 User: "${userQuery}"\n`);

  try {
    const result = await parseIntentWithFallback(userQuery, prompt);
    
    console.log('\n✨ --- AI PARSING RESULT --- ✨');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n✅ System is operational.');
  } catch (error) {
    console.error('\n❌ All AI providers failed:', error.message);
  }
};

testMultiAI();
