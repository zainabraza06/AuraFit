import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import { inferColors } from './scrapers/utils/colorInference.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const products = await Product.find({}).lean();
    console.log(`🔍 Found ${products.length} products to re-evaluate colors for...`);

    let updated = 0;
    for (const p of products) {
      const textBlob = [p.name, p.description || '', (p.tags || []).join(' ')].join(' ');
      const { primaryColor, colors } = inferColors(textBlob);

      // Only update if it actually changed to save time
      if (p.primaryColor !== primaryColor || JSON.stringify(p.colors) !== JSON.stringify(colors)) {
        await Product.findByIdAndUpdate(p._id, { primaryColor, colors });
        updated++;
        process.stdout.write(`\r🛠️ Fixed colors for ${updated} products`);
      }
    }
    console.log(`\n✨ Finished! Corrected colors for ${updated} products.`);
  } catch (err) {
    console.error('Fatal Error:', err);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
}

run();
