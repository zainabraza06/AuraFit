/**
 * embedAll.js
 * Batch generates Hugging Face embeddings for products that do not have them.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import { getTextEmbedding } from '../services/huggingface.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const products = await Product.find({ $or: [{ embedding: { $exists: false } }, { embedding: [] }] }).lean();
    console.log(`🔍 Found ${products.length} products needing embeddings.`);

    let updated = 0;
    for (const product of products) {
      try {
        const text = [
          product.name,
          product.brand,
          product.category,
          product.subCategory,
          ...(product.style || []),
          ...(product.occasion || []),
          ...(product.colors || [])
        ].filter(Boolean).join(', ');

        const embedding = await getTextEmbedding(text);
        
        if (embedding?.length) {
          const flatEmbedding = Array.isArray(embedding[0]) ? embedding[0] : embedding;
          await Product.findByIdAndUpdate(product._id, { embedding: flatEmbedding });
          updated++;
          process.stdout.write(`\r🚀 Embedded ${updated}/${products.length} products`);
        }
        
        // Wait 300ms to respect Hugging Face free tier rate limits
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`\n❌ Failed for ${product._id}:`, e.message);
      }
    }
    
    console.log(`\n✨ Finished! Successfully embedded ${updated} products.`);
  } catch (err) {
    console.error('Fatal Error:', err);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
}

run();
