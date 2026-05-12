import mongoose from 'mongoose';

/**
 * ClothingProduct Schema
 * Full taxonomy for Pakistani fashion clothing products.
 * Normalized fields for AI recommendations, vector search, and filtering.
 */

// ─── Normalized Size Sub-Schema ───────────────────────────────────────────────
const NormalizedSizeSchema = new mongoose.Schema(
  {
    type:  { type: String, enum: ['alpha', 'numeric', 'waist', 'free'], required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
    // alpha  → 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
    // numeric → 6 | 8 | 10 | 12 | 14 | 16
    // waist  → 26 | 28 | 30 | 32
    // free   → 'Free Size' | 'One Size'
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────
const ClothingProductSchema = new mongoose.Schema(
  {
    // ─── Core Identity ───────────────────────────────────────────────────
    name:   { type: String, required: true, trim: true, maxlength: 200 },
    brand:  { type: String, required: true, trim: true },

    // ─── Classification ──────────────────────────────────────────────────
    category:    { type: String, default: 'clothing', immutable: true },
    subCategory: {
      type: String,
      enum: [
        '2-piece', '3-piece', '4-piece',
        'kurta', 'pants', 'shalwar', 'dupatta',
        'unstitched-1-piece', 'unstitched-2-piece', 'unstitched-3-piece',
        'festive', 'bridal', 'western', 'co-ord', 'other',
        'mens-kurta', 'mens-shirt-tops', 'mens-formal-wear', 'mens-western-sets',
        'mens-unstitched-2-piece', 'mens-unstitched-3-piece', 'mens-waistcoat', 'mens-shalwar-kameez'
      ],
      default: 'other'
    },

    // ─── Piece System ─────────────────────────────────────────────────────
    pieceType: {
      type: String,
      enum: ['1-piece', '2-piece', '3-piece', '4-piece']
      // Derived from subCategory or text. Stored explicitly for filtering.
    },
    pieceDetails: {
      // What the pieces ARE (e.g. shirt + trouser, shirt + dupatta)
      includes:   [{ type: String }],   // e.g. ['shirt', 'trouser', 'dupatta']
      totalCount: { type: Number, min: 1, max: 4 }
    },

    // ─── Stitched / Unstitched ───────────────────────────────────────────
    stitchedType: {
      type: String,
      enum: ['stitched', 'unstitched', 'semi-stitched'],
      default: 'stitched'
    },

    // ─── Dress Style (garment silhouette) ────────────────────────────────
    dressStyle: {
      type: String,
      enum: [
        'kurta', 'shalwar-kameez', 'frock', 'maxi', 'gown', 'lehenga',
        'saree', 'abaya', 'tunic', 'co-ord', 'palazzo', 'western',
        'shirt', 'trouser', 'top', 'jacket', 'pant-coat', 'sherwani',
        't-shirt', 'polo', 'other'
      ]
    },

    // ─── Fashion Type ─────────────────────────────────────────────────────
    fashionType: {
      type: String,
      enum: ['eastern', 'western', 'fusion'],
      default: 'eastern'
    },

    // ─── Gender (indexed for catalog filters: women | men | kids | unisex) ─
    gender: {
      type: String,
      enum: ['women', 'men', 'kids', 'unisex'],
      required: true,
      default: 'women'
    },

    // ─── Occasion ────────────────────────────────────────────────────────
    occasion: [{ type: String }],   // casual, formal, party, bridal, eid, office, mehndi, wedding

    // ─── Season ──────────────────────────────────────────────────────────
    season: [{ type: String }],     // summer, winter, all-season

    // ─── Fabric ──────────────────────────────────────────────────────────
    fabric: { type: String, trim: true },   // lawn, chiffon, cotton, silk, karandi…

    // ─── Pattern ─────────────────────────────────────────────────────────
    pattern: {
      type: String,
      enum: ['plain', 'printed', 'embroidered', 'digital-print', 'floral', 'geometric', 'textured', 'embellished', 'mixed']
    },

    // ─── Colors ──────────────────────────────────────────────────────────
    colors:            [{ type: String }],   // color families: ['Red', 'Gold']
    primaryColor:      { type: String },     // dominant family: 'Red'
    exactColors:       [{ type: String }],   // exact shades: ['maroon', 'golden']
    primaryExactColor: { type: String },     // dominant exact: 'maroon'
    colorFamily: {
      type: String,
      enum: ['red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'neutral', 'earth', 'teal', 'multicolor']
    },

    // ─── Sizes (normalized) ───────────────────────────────────────────────
    sizes:           [{ type: String }],           // raw strings: ['S', 'M', 'L'] or ['8', '10', '12']
    normalizedSizes: [NormalizedSizeSchema],        // structured: [{type:'alpha', value:'M'}]

    // ─── Price Range (derived) ────────────────────────────────────────────
    priceRange: {
      type: String,
      enum: ['low', 'mid', 'high']
      // low  < 3000 PKR
      // mid  3000–8000 PKR
      // high > 8000 PKR
    },

    // ─── Trend & Style Tags ───────────────────────────────────────────────
    trendTags: [{ type: String }],   // minimalist, luxury, festive, traditional, modern
    style:     [{ type: String }],   // adjective tags: embroidered, minimal, trendy, elegant

    // ─── Garment-Level Details ────────────────────────────────────────────
    sleeveType: {
      type: String,
      enum: ['full-sleeve', 'half-sleeve', 'sleeveless', 'cap-sleeve', 'three-quarter']
    },
    neckline: {
      type: String,
      enum: ['round', 'v-neck', 'boat-neck', 'collar', 'keyhole', 'halter', 'square', 'off-shoulder']
    },
    fitType: {
      type: String,
      enum: ['loose', 'regular', 'slim', 'flared', 'straight']
    },

    // ─── Media ───────────────────────────────────────────────────────────
    images:   [{ type: String }],
    imageUrl: { type: String },      // primary image (alias)

    // ─── Content ─────────────────────────────────────────────────────────
    description: { type: String, maxlength: 2000 },
    tags:        [{ type: String }],

    // ─── Pricing ─────────────────────────────────────────────────────────
    price:          { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    currency:       { type: String, default: 'PKR' },

    // ─── Source ──────────────────────────────────────────────────────────
    productUrl: { type: String, required: true, unique: true },
    source:     { type: String },
    handle:     { type: String },

    // ─── AI Layer ────────────────────────────────────────────────────────
    embedding:      [{ type: Number }],
    embeddingModel: { type: String },
    aiEnriched:     { type: Boolean, default: false },   // true when Gemini filled missing fields
    metadataScore:  { type: Number, default: 0 },        // completeness 0-1

    // ─── Timestamps ──────────────────────────────────────────────────────
    scrapedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: { createdAt: 'scrapedAt', updatedAt: 'updatedAt' },
    toJSON:     { virtuals: true }
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
ClothingProductSchema.index({ brand: 1, category: 1 });
ClothingProductSchema.index({ subCategory: 1 });
ClothingProductSchema.index({ pieceType: 1 });
ClothingProductSchema.index({ stitchedType: 1 });
ClothingProductSchema.index({ fashionType: 1 });
ClothingProductSchema.index({ dressStyle: 1 });
ClothingProductSchema.index({ primaryColor: 1 });
ClothingProductSchema.index({ colorFamily: 1 });
ClothingProductSchema.index({ pattern: 1 });
ClothingProductSchema.index({ occasion: 1 });
ClothingProductSchema.index({ gender: 1 });
ClothingProductSchema.index({ gender: 1, scrapedAt: -1 });
ClothingProductSchema.index({ priceRange: 1 });
ClothingProductSchema.index({ trendTags: 1 });
ClothingProductSchema.index({ price: 1 });
ClothingProductSchema.index({ tags: 1 });
ClothingProductSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });

// ─── Virtual: primary image ───────────────────────────────────────────────────
ClothingProductSchema.virtual('primaryImage').get(function () {
  return this.imageUrl || (this.images && this.images[0]) || null;
});

// ─── Pre-save hooks ───────────────────────────────────────────────────────────
ClothingProductSchema.pre('save', function (next) {
  // Sync imageUrl ↔ images array
  if (this.images && this.images.length > 0 && !this.imageUrl) {
    this.imageUrl = this.images[0];
  } else if (this.imageUrl && (!this.images || this.images.length === 0)) {
    this.images = [this.imageUrl];
  }

  // Sync primary color fields
  if (!this.primaryColor && this.colors && this.colors.length > 0) {
    this.primaryColor = this.colors[0];
  }
  if (!this.primaryExactColor && this.exactColors && this.exactColors.length > 0) {
    this.primaryExactColor = this.exactColors[0];
  }

  next();
});

export default mongoose.models.ClothingProduct ||
  mongoose.model('ClothingProduct', ClothingProductSchema);
