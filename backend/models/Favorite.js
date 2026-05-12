import mongoose from 'mongoose';

/** Must match registered Mongoose model names for populate(refPath). */
const PRODUCT_KINDS = ['ClothingProduct', 'ShoeProduct', 'JewelryProduct', 'WatchProduct'];

/**
 * Favorite — user ↔ catalog item (clothing or accessory).
 */
const FavoriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productKind: {
      type: String,
      enum: PRODUCT_KINDS,
      default: 'ClothingProduct',
      required: true
    },
    product: { type: mongoose.Schema.Types.ObjectId, refPath: 'productKind', required: true }
  },
  { timestamps: true }
);

FavoriteSchema.index({ user: 1, product: 1 }, { unique: true });

export default mongoose.models.Favorite || mongoose.model('Favorite', FavoriteSchema);
