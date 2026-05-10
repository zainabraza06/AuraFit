/**
 * embedAll.js
 * Batch generates Hugging Face embeddings for products that do not have them.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import { getTextEmbedding } from '../services/huggingface.js';

dotenv.config();

export async function embedAllProducts() {
  try {
    const products = await Product.find({ $or: [{ embedding: { $exists: false } }, { embedding: [] }] }).lean();
    console.log(`\n🔍 Found ${products.length} products needing embeddings.`);

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
        
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`\n❌ Failed for ${product._id}:`, e.message);
      }
    }
    
    console.log(`\n✨ Finished! Successfully embedded ${updated} products.`);
    return updated;
  } catch (err) {
    console.error('Fatal Error during embedding:', err);
    throw err;
  }
}

// Allow running as a standalone script
const isMain = process.argv[1] && process.argv[1].endsWith('embedAll.js');
if (isMain) {
  mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('✅ Connected to MongoDB for standalone embedding');
    await embedAllProducts();
    mongoose.disconnect();
    process.exit(0);
  });
}
