/**
 * embedAll.js — (re)generate embeddings for every catalog with the current model.
 *
 *   npm run embed:all
 *
 * Embeds rows that have no vector, an empty vector, or a vector from a different model
 * (e.g. the old 384-dim MiniLM ones). Rows that are already current are skipped, so it is
 * safe to run after every scrape. Runs fully locally (Qwen3-Embedding via transformers.js).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { embedAllCatalogs } from '../services/embeddingJobs.js';
import { EMBEDDING_MODEL_ID } from '../services/embeddings.js';

dotenv.config();

/** Used by the scraper cron after each run. Returns the total number of rows embedded. */
export async function embedAllProducts() {
  console.log(`\nEmbedding with ${EMBEDDING_MODEL_ID}`);
  const results = await embedAllCatalogs();
  const total = Object.values(results).reduce((n, r) => n + r.embedded, 0);
  const failed = Object.values(results).reduce((n, r) => n + r.failed, 0);
  console.log(`\nDone: ${total} embedded, ${failed} failed.`, JSON.stringify(results));
  return total;
}

const isMain = process.argv[1] && process.argv[1].endsWith('embedAll.js');
if (isMain) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(embedAllProducts)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
