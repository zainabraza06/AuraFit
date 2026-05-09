import mongoose from 'mongoose';

/**
 * Outfit — a curated combination of products (clothing + shoes + accessories).
 * Can be AI-generated or user-created.
 */
const OutfitSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    description: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isAIGenerated: { type: Boolean, default: false },

    // The core products in this outfit
    clothing: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    shoes: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    accessories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    // AI scoring breakdown
    scores: {
      total: { type: Number, default: 0 },           // 0-1 composite score
      embeddingSimilarity: { type: Number, default: 0 },
      colorCompatibility: { type: Number, default: 0 },
      occasionCompatibility: { type: Number, default: 0 },
      styleCompatibility: { type: Number, default: 0 }
    },

    occasion: [{ type: String }],
    style: [{ type: String }],
    tags: [{ type: String }],

    likes: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.models.Outfit || mongoose.model('Outfit', OutfitSchema);
