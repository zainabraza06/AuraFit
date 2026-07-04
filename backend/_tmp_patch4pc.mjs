import dotenv from 'dotenv'; import path from 'path';
dotenv.config({ path: path.resolve('.env') });
import connectDB from './config/db.js';
import Clothing from './models/ClothingProduct.js';
await connectDB();
const docs = await Clothing.find({ pieceType: '4-piece', stitchedType: 'unstitched' });
let n = 0;
for (const d of docs) {
  d.subCategory = 'unstitched-4-piece';
  d.pieceDetails = { includes: ['fabric-shirt','fabric-trouser','fabric-dupatta','fabric-inner'], totalCount: 4 };
  await d.save();
  n++;
}
console.log('Patched 4pc-unstitched docs:', n);
process.exit(0);
