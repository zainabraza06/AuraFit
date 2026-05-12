import mongoose from 'mongoose';

/**
 * Favorite — explicit join table for user-product favorites.
 */
const FavoriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'ClothingProduct', required: true }
  },
  { timestamps: true }
);

FavoriteSchema.index({ user: 1, product: 1 }, { unique: true });

export default mongoose.models.Favorite || mongoose.model('Favorite', FavoriteSchema);
