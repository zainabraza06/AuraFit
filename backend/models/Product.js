import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  title: { type: String, required: true },
  brand: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, enum: ['Dress', 'Shoe', 'Jewelry'], required: true },
  imageUrl: { type: String, required: true },
  productUrl: { type: String, required: true, unique: true },
  color: { type: String, required: true },
  occasion: [{ type: String }],
  style: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
