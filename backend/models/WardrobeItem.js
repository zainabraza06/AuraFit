import mongoose from 'mongoose';

const WardrobeItemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: String,
  category: {
    type: String,
    enum: ['clothing', 'shoes', 'accessories'],
    required: true
  },
  subCategory: String,
  primaryColor: String,
  imageUrl: String, // Path to their uploaded photo
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('WardrobeItem', WardrobeItemSchema);
