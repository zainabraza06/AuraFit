import mongoose from 'mongoose';

const OutfitSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    default: 'My Curated Look'
  },
  heroProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  accessories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  stylistReasoning: String,
  occasion: [String],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Outfit', OutfitSchema);
