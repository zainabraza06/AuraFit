/**
 * embedAccessories.js — kept for backwards compatibility with `npm run embed:accessories`.
 * Embedding is now one shared job for every catalog: see scripts/embedAll.js.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { embedPending } from '../services/embeddingJobs.js';
import ShoeProduct from '../models/ShoeProduct.js';
import JewelryProduct from '../models/JewelryProduct.js';
import { buildShoeEmbeddingText, buildJewelryEmbeddingText } from '../services/embeddingText.js';

dotenv.config();

export async function embedAllAccessories() {
  const shoes = await embedPending(ShoeProduct, buildShoeEmbeddingText);
  const jewelry = await embedPending(JewelryProduct, buildJewelryEmbeddingText);
  console.log('shoes', shoes, 'jewelry', jewelry);
  return shoes.embedded + jewelry.embedded;
}

const isMain = process.argv[1] && process.argv[1].endsWith('embedAccessories.js');
if (isMain) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(embedAllAccessories)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
