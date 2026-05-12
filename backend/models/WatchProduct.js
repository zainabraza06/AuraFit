import mongoose from 'mongoose';

/**
 * Wristwear / timepieces (fashion & everyday).
 */
const WatchProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 220 },
    brand: { type: String, required: true, trim: true },
    category: { type: String, default: 'watches', immutable: true },

    watchType: {
      type: String,
      enum: [
        'analog', 'digital', 'smartwatch', 'hybrid', 'chronograph',
        'dress', 'minimalist', 'sports', 'diver-style', 'pilot',
        'couple-set', 'kids', 'pocket-style', 'other'
      ]
    },
    dialShape: {
      type: String,
      enum: ['round', 'square', 'rectangular', 'tonneau', 'oval', 'other']
    },
    caseMaterial: {
      type: String,
      enum: ['alloy', 'stainless-steel', 'brass', 'ceramic', 'plastic', 'titanium-hint', 'wood', 'other']
    },
    strapType: {
      type: String,
      enum: ['leather', 'metal-bracelet', 'mesh', 'silicone', 'rubber', 'fabric', 'nato', 'ceramic', 'combo', 'other']
    },
    movement: {
      type: String,
      enum: ['quartz', 'mechanical', 'automatic', 'digital-module', 'solar', 'smart-os', 'unknown']
    },
    waterResistance: {
      type: String,
      enum: ['none', 'splash', '30m', '50m', '100m', '200m-plus', 'unknown']
    },
    crystal: {
      type: String,
      enum: ['mineral', 'sapphire', 'acrylic', 'unknown']
    },
    features: [{ type: String }],

    dialColor: { type: String, trim: true },
    caseDiameterMm: { type: Number, min: 10, max: 60 },

    gender: {
      type: String,
      enum: ['women', 'men', 'kids', 'unisex'],
      default: 'unisex'
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

    scrapedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: { createdAt: 'scrapedAt', updatedAt: 'updatedAt' }, toJSON: { virtuals: true } }
);

WatchProductSchema.index({ brand: 1, watchType: 1 });
WatchProductSchema.index({ gender: 1 });
WatchProductSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });

export default mongoose.models.WatchProduct || mongoose.model('WatchProduct', WatchProductSchema);
