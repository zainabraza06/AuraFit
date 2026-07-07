/**
 * embedAccessories.js
 * Batch-generates HuggingFace embeddings for shoes + jewelry that lack them.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import { getTextEmbedding } from '../services/huggingface.js';
import { buildShoeEmbeddingText, buildJewelryEmbeddingText } from '../services/embeddingText.js';

dotenv.config();

const MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2';

async function embedCollection(Model, buildText, label) {
  const products = await Model.find({
    $or: [{ embedding: { $exists: false } }, { embedding: [] }]
  }).lean();
  console.log(`\n🔍 [${label}] ${products.length} need embeddings.`);
  let updated = 0, failed = 0;
  for (const p of products) {
    try {
      const text = buildText(p);
      const embedding = await getTextEmbedding(text);
      if (embedding?.length) {
        const flat = Array.isArray(embedding[0]) ? embedding[0] : embedding;
        await Model.findByIdAndUpdate(p._id, { embedding: flat, embeddingModel: MODEL_NAME });
        updated++;
        process.stdout.write(`\r🚀 [${label}] ${updated}/${products.length}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      failed++;
      console.error(`\n❌ [${label}] ${p._id}:`, e.message);
    }
  }
  console.log(`\n✨ [${label}] embedded ${updated}, failed ${failed}.`);
  return updated;
}

export async function embedAllAccessories() {
  await embedCollection(ShoeProduct, buildShoeEmbeddingText, 'shoes');
  await embedCollection(JewelryProduct, buildJewelryEmbeddingText, 'jewelry');
}

const isMain = process.argv[1] && process.argv[1].endsWith('embedAccessories.js');
if (isMain) {
  mongoose.connect(process.env.MONGO_URI).then(async () => {
    console.log('✅ Connected to MongoDB for accessory embedding');
    await embedAllAccessories();
    await mongoose.disconnect();
    process.exit(0);
  });
}
