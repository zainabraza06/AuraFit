import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import { inferColors } from './scrapers/utils/colorInference.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const products = await Product.find({}).lean();
    console.log(`Found ${products.length} products to re-evaluate colors for...`);

    let updated = 0;
    for (const p of products) {
      const textBlob = [p.name, p.description || '', (p.tags || []).join(' ')].join(' ');
      const { primaryColor, colors, primaryExactColor, exactColors } = inferColors(textBlob);

      const changed =
        p.primaryColor !== primaryColor ||
        JSON.stringify(p.colors) !== JSON.stringify(colors) ||
        p.primaryExactColor !== primaryExactColor ||
        JSON.stringify(p.exactColors) !== JSON.stringify(exactColors);

      if (changed) {
        await Product.findByIdAndUpdate(p._id, { primaryColor, colors, primaryExactColor, exactColors });
        updated++;
        process.stdout.write(`\r Fixed colors for ${updated} products`);
      }
    }
    console.log(`\nFinished! Corrected colors for ${updated} products.`);
  } catch (err) {
    console.error('Fatal Error:', err);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
}

run();
