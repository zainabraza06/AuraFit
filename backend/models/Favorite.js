import mongoose from 'mongoose';

/**
 * Favorite — explicit join table for user-product favorites.
 * Provides full query flexibility (e.g. "all users who favorited product X").
 */
const FavoriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }
  },
  { timestamps: true }
);

// Compound unique index prevents duplicate favorites
FavoriteSchema.index({ user: 1, product: 1 }, { unique: true });

export default mongoose.models.Favorite || mongoose.model('Favorite', FavoriteSchema);
