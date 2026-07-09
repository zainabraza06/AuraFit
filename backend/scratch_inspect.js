import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ClothingProduct from './models/ClothingProduct.js';

dotenv.config();

async function main() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ai-fashion-stylist';
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const lehengas = await ClothingProduct.find({ dressStyle: 'lehenga' }).lean();
  console.log(`Found ${lehengas.length} lehengas:`);
  lehengas.forEach((p, idx) => {
    console.log(`${idx + 1}. Name: ${p.name}`);
    console.log(`   PrimaryColor: ${p.primaryColor}`);
    console.log(`   Colors:`, p.colors);
    console.log(`   ExactColors:`, p.exactColors);
    console.log(`   Occasion:`, p.occasion);
    console.log(`   SubCategory: ${p.subCategory}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
