import mongoose from 'mongoose';
import dotenv from 'dotenv'; import path from 'path';
dotenv.config({ path: path.resolve('.env') });
await mongoose.connect(process.env.MONGO_URI);
for (const c of ['clothingproducts', 'shoeproducts', 'scraperlogs']) {
  const col = mongoose.connection.db.collection(c);
  const n = await col.countDocuments();
  await col.deleteMany({});
  console.log(`Cleared ${n} from ${c}`);
}
console.log('Done.');
process.exit(0);
