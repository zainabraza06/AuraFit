import dotenv from 'dotenv'; import path from 'path';
dotenv.config({ path: path.resolve('.env') });
import connectDB from './config/db.js';
import Shoe from './models/ShoeProduct.js';
await connectDB();
const r = await Shoe.deleteMany({ name: { $regex: /\b(girls?|boys?|kids?|child|children|junior|toddler|infant)\b/i } });
console.log('Deleted kids shoes:', r.deletedCount);
console.log('Shoes remaining:', await Shoe.countDocuments());
process.exit(0);
