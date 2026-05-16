import mongoose from 'mongoose';

/**
 * Fashion jewelry — ethnic & contemporary.
 */
const JewelryProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 220 },
    brand: { type: String, required: true, trim: true },
    category: { type: String, default: 'jewelry', immutable: true },

    jewelryType: {
      type: String,
      enum: [
        'earring', 'stud', 'hoop', 'jhumka', 'chandbali',
        'necklace', 'choker', 'mala', 'pendant-chain', 'long-necklace',
        'bracelet', 'kada', 'bangle', 'bangle-set',
        'ring', 'nose-pin', 'nath', 'maang-tikka', 'jhoomar', 'passa',
        'bridal-set', 'necklace-earring-set', 'full-jewelry-set',
        'anklet', 'payal', 'brooch', 'sherwani-button-set', 'cufflinks',
        'hair-accessory', 'other'
      ]
    },
    /** Broad shelf group */
    jewelryCategory: {
      type: String,
      enum: ['ear', 'neck', 'wrist', 'hand', 'nose', 'head', 'bridal-set', 'combo', 'other'],
      default: 'other'
    },

    metalFinish: {
      type: String,
      enum: [
        'gold-plated', 'rose-gold-plated', 'silver', 'oxidized-silver',
        'imitation-gold', 'stainless-steel', 'brass', 'copper-hint',
        'two-tone', 'unknown'
      ]
    },
    stoneWork: {
      type: String,
      enum: ['none', 'kundan', 'polki', 'meenakari', 'pearls', 'cz', 'semi-precious', 'artificial', 'mixed']
    },
    setPieceCount: { type: Number, min: 1, max: 24 },

    gender: {
      type: String,
      enum: ['women', 'men', 'kids', 'unisex'],
      default: 'women'
    },
    occasion: [{ type: String }],
    season: [{ type: String }],

    colors: [{ type: String }],
    primaryColor: { type: String },
    exactColors: [{ type: String }],
    primaryExactColor: { type: String },
    colorFamily: {
      type: String,
      enum: ['red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'neutral', 'earth', 'teal', 'multicolor']
    },

    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    currency: { type: String, default: 'PKR' },

    images: [{ type: String }],
    imageUrl: { type: String },
    description: { type: String, maxlength: 4000 },
    tags: [{ type: String }],
    style: [{ type: String }],
    trendTags: [{ type: String }],

    productUrl: { type: String, required: true, unique: true },
    source: { type: String },
    handle: { type: String },

    embedding: [{ type: Number }],
    embeddingModel: { type: String },
    aiEnriched: { type: Boolean, default: false },
    metadataScore: { type: Number, default: 0 },

    inStock:          { type: Boolean, default: true },
    stockLastChecked: { type: Date },

    scrapedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'scrapedAt', updatedAt: 'updatedAt' }, toJSON: { virtuals: true } }
);

JewelryProductSchema.index({ brand: 1, jewelryType: 1 });
JewelryProductSchema.index({ jewelryCategory: 1, occasion: 1 });
JewelryProductSchema.index({ inStock: 1 });
JewelryProductSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });

export default mongoose.models.JewelryProduct || mongoose.model('JewelryProduct', JewelryProductSchema);
