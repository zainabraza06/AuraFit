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

    // 2. Call the outfit query engine (dynamic scoring)
    const result = await getOutfitForQuery(intent);

    console.log('✨ --- AI STYLIST RECOMMENDATION --- ✨');
    if (result.heroDress) {
      const heroScore = result.scores?.[0];
      console.log('--- 🏆 TOP AI PICK (Hero) ---');
      console.log(`👗 DRESS:     ${result.heroDress.name}`);
      console.log(`🏷️  BRAND:     ${result.heroDress.brand}`);
      console.log(`💰 PRICE:     PKR ${result.heroDress.price}`);
      console.log(`🎨 COLOR:     ${result.heroDress.primaryColor}`);
      if (heroScore) {
        console.log(`📊 SCORES:    Color=${Math.round(heroScore.colorMatch*100)}%  Occasion=${Math.round(heroScore.occasionMatch*100)}%  Style=${Math.round(heroScore.styleMatch*100)}%  Keywords=${Math.round(heroScore.keywordMatch*100)}%`);
      }
      console.log('');

      if (result.otherDresses?.length > 0) {
        console.log('--- 🛍️  OTHER MATCHING OPTIONS ---');
        result.otherDresses.forEach((dress, i) => {
          const s = result.scores?.[i + 1];
          const scoreStr = s ? ` [score: ${s.total}]` : '';
          console.log(`   #${i+2}. ${dress.name} (${dress.brand}) - PKR ${dress.price}${scoreStr}`);
        });
        console.log('');
      }

      if (result.shoes?.length > 0) {
        console.log('--- 👠 RECOMMENDED SHOES ---');
        result.shoes.slice(0, 3).forEach((shoe, i) => {
          console.log(`   ${i+1}. ${shoe.name} (${shoe.brand}) - PKR ${shoe.price}`);
        });
      }
    } else {
      console.log('❌ No matching products found for this query.');
    }

    console.log('\n✅ Test Complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
};

testStylist();
