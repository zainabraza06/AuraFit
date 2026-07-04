import dotenv from 'dotenv'; import path from 'path';
dotenv.config({ path: path.resolve('.env') });
import connectDB from './config/db.js';
import Clothing from './models/ClothingProduct.js';
import Shoe from './models/ShoeProduct.js';
await connectDB();
console.log('clothing:', await Clothing.countDocuments(), 'shoes:', await Shoe.countDocuments());
console.log('clothing brands:', JSON.stringify(await Clothing.aggregate([{$group:{_id:'$brand',n:{$sum:1}}}])));
process.exit(0);
