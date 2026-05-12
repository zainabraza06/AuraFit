/**
 * clearDB.js
 * Utility script to wipe all collections for a fresh start.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const clearDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) throw new Error('MONGO_URI not found in .env');

    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected.');

    const collections = ['clothingproducts', 'shoeproducts', 'watchproducts', 'jewelryproducts', 'scraperlogs', 'favorites', 'outfits'];
    
    for (const colName of collections) {
      const collection = mongoose.connection.db.collection(colName);
      const count = await collection.countDocuments();
      if (count > 0) {
        await collection.deleteMany({});
        console.log(`🗑️  Cleared ${count} documents from '${colName}'`);
      } else {
        console.log(`➖ Collection '${colName}' is already empty.`);
      }
    }

    console.log('\n✨ Database is now completely fresh.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    process.exit(1);
  }
};

clearDB();
