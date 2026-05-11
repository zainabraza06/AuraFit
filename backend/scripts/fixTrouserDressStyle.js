/**
 * fixTrouserDressStyle.js
 * Fixes standalone trouser products that were mislabeled as dressStyle='shalwar-kameez'
 * because they came from a '2-piece' collection config.
 *
 * Detects: name contains "trouser" but NOT a shirt+trouser set indicator ("&", "shirt ... trouser")
 * Fix:     clear dressStyle, set pieces=1
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all products tagged shalwar-kameez with "trouser" in name but no set indicator
    const candidates = await Product.find({
      dressStyle: 'shalwar-kameez',
      name: { $regex: /trouser/i }
    }).lean();

    console.log(`Found ${candidates.length} shalwar-kameez products with "trouser" in name`);

    let fixed = 0;
    for (const p of candidates) {
      const nameLower = p.name.toLowerCase();
      const isSet = /&|shirt.*trouser|trouser.*shirt|\bset\b/.test(nameLower);
      if (!isSet) {
        await Product.findByIdAndUpdate(p._id, {
          $unset: { dressStyle: '' },
          pieces: 1
        });
        fixed++;
        console.log(`  Fixed: "${p.name}" [${p.brand}]`);
      }
    }

    console.log(`\nDone. Fixed ${fixed} standalone trouser products.`);
  } catch (err) {
    console.error('Fatal Error:', err);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
}

run();
