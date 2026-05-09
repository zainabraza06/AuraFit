/**
 * testAIStylist.js
 * Tests the "Master Stylist" recommendation logic with real DB data.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getOutfitForQuery } from '../services/recommendationEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const testStylist = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (!MONGO_URI || !GEMINI_KEY) {
      throw new Error('MONGO_URI or GEMINI_API_KEY missing from .env');
    }

    console.log('⏳ Connecting to Database...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.\n');

    const ai = new GoogleGenerativeAI(GEMINI_KEY);
    
    // --- Test Input ---
    const userMessage = "I need a beautiful pink dress for a summer wedding, my budget is around 15000 PKR";
    console.log(`👤 User: "${userMessage}"`);
    console.log('🤖 AI Stylist is thinking...\n');

    // 1. Simulate Intent Parsing (Simplified for test)
    const intent = {
      color: 'Pink',
      occasion: ['wedding'],
      style: ['elegant', 'embroidered'],
      maxBudget: 15000
    };

    // 2. Call the "Master Stylist" logic
    const result = await getOutfitForQuery(intent, ai);

    console.log('✨ --- AI STYLIST RECOMMENDATION --- ✨');
    if (result.heroDress) {
      console.log('--- 🏆 TOP AI PICK (Hero) ---');
      console.log(`👗 DRESS:     ${result.heroDress.name}`);
      console.log(`🏷️  BRAND:     ${result.heroDress.brand}`);
      console.log(`💰 PRICE:     PKR ${result.heroDress.price}`);
      console.log(`📝 WHY:       "${result.reasoning}"\n`);

      if (result.otherDresses && result.otherDresses.length > 0) {
        console.log('--- 🛍️  OTHER MATCHING OPTIONS ---');
        result.otherDresses.forEach((dress, i) => {
          console.log(`   ${i+1}. ${dress.name} (${dress.brand}) - PKR ${dress.price}`);
        });
        console.log('');
      }

      if (result.shoes && result.shoes.length > 0) {
        console.log('--- 👠 RECOMMENDED SHOES ---');
        result.shoes.slice(0, 3).forEach((shoe, i) => {
          console.log(`   ${i+1}. ${shoe.name} (${shoe.brand}) - PKR ${shoe.price}`);
        });
      }
    } else {
      console.log('❌ No matching products found for this specific query.');
    }

    console.log('\n✅ Test Complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
};

testStylist();
