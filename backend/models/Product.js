import mongoose from 'mongoose';

/**
 * Unified Product Schema — normalizes clothing, shoes, and accessories
 * from all scraped Pakistani fashion brands into one consistent structure.
 */
const ProductSchema = new mongoose.Schema(
  {
    // ─── Core Identity ───────────────────────────────────────────────
    name: { type: String, required: true, trim: true, maxlength: 200 },
    brand: { type: String, required: true, trim: true },

    // ─── Classification ──────────────────────────────────────────────
    category: {
      type: String,
      required: true,
      enum: ['clothing', 'shoes', 'accessories']
    },
    subCategory: {
      type: String,
      enum: [
        // Clothing — stitched
        '2-piece', '3-piece', 'kurta', 'pants', 'shalwar', 'dupatta', 'western', 'festive', 'bridal',
        // Clothing — unstitched
        'unstitched-2-piece', 'unstitched-3-piece',
        // Shoes
        'heels', 'flats', 'sandals', 'sneakers', 'khussa', 'boots', 'mules',
        // Accessories
        'jewelry', 'bags', 'scarves',
        // Fallback
        'other'
      ],
      default: 'other'
    },
    type: { type: String, trim: true },         // e.g. "lawn", "chiffon", "block heel"

    // ─── Gender ──────────────────────────────────────────────────────
    gender: {
      type: String,
      enum: ['women', 'men', 'kids', 'unisex'],
      default: 'women'
    },

    // ─── Pieces count ─────────────────────────────────────────────────
    pieces: { type: Number, min: 1, max: 3 },   // 1, 2, or 3

    // ─── Style Metadata ──────────────────────────────────────────────
    style: [{ type: String }],                  // e.g. ["elegant", "minimal", "trendy"]
    occasion: [{ type: String }],               // e.g. ["wedding", "office", "casual"]
    season: [{ type: String }],                 // e.g. ["summer", "winter", "all-season"]
    fabric: { type: String, trim: true },       // e.g. "Pure Lawn", "Chiffon"

    // ─── Colors ──────────────────────────────────────────────────────
    colors: [{ type: String }],                 // canonical families e.g. ["Red", "Gold"]
    primaryColor: { type: String },             // canonical dominant color e.g. "Red"
    exactColors: [{ type: String }],            // exact scraped shades e.g. ["maroon", "golden"]
    primaryExactColor: { type: String },        // exact primary shade e.g. "maroon"

    // ─── Sizing ──────────────────────────────────────────────────────
    sizes: [{ type: String }],                  // e.g. ["XS", "S", "M", "L"]

    // ─── Media ───────────────────────────────────────────────────────
    images: [{ type: String }],                 // array of absolute image URLs
    imageUrl: { type: String },                 // primary image (alias for compatibility)

    // ─── Content ─────────────────────────────────────────────────────
    description: { type: String, maxlength: 2000 },
    tags: [{ type: String }],                   // free-form searchable tags

    // ─── Pricing ─────────────────────────────────────────────────────
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },   // original price before sale
    currency: { type: String, default: 'PKR' },

    // ─── Source ──────────────────────────────────────────────────────
    productUrl: { type: String, required: true, unique: true },
    source: { type: String },                   // scraper adapter name
    handle: { type: String },                   // Shopify handle

    // ─── AI Layer ────────────────────────────────────────────────────
    embedding: [{ type: Number }],              // semantic embedding vector
    embeddingModel: { type: String },           // e.g. "text-embedding-3-small"
    metadataScore: { type: Number, default: 0 },// completeness score 0-1

    // ─── Timestamps ──────────────────────────────────────────────────
    scrapedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: { createdAt: 'scrapedAt', updatedAt: 'updatedAt' },
    toJSON: { virtuals: true }
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
ProductSchema.index({ brand: 1, category: 1 });
ProductSchema.index({ category: 1, subCategory: 1 });
ProductSchema.index({ primaryColor: 1, category: 1 });
ProductSchema.index({ occasion: 1 });
ProductSchema.index({ gender: 1, category: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });

// ─── Virtual: primary image ───────────────────────────────────────────────────
ProductSchema.virtual('primaryImage').get(function () {
  return this.imageUrl || (this.images && this.images[0]) || null;
});

// ─── Pre-save: sync imageUrl with images array ────────────────────────────────
ProductSchema.pre('save', function (next) {
  if (this.images && this.images.length > 0 && !this.imageUrl) {
    this.imageUrl = this.images[0];
  } else if (this.imageUrl && (!this.images || this.images.length === 0)) {
    this.images = [this.imageUrl];
  }
  if (!this.primaryColor && this.colors && this.colors.length > 0) {
    this.primaryColor = this.colors[0];
  }
  if (!this.primaryExactColor && this.exactColors && this.exactColors.length > 0) {
    this.primaryExactColor = this.exactColors[0];
  }
  next();
});

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
