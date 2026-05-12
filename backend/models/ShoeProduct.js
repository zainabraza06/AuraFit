import mongoose from 'mongoose';

const NormalizedSizeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['alpha', 'numeric', 'eu', 'uk', 'us', 'free'], required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { _id: false }
);

/**
 * Footwear catalog — PK/ethnic + western athletic.
 */
const ShoeProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 220 },
    brand: { type: String, required: true, trim: true },
    category: { type: String, default: 'shoes', immutable: true },

    /** Primary taxonomy: silhouette / construction */
    shoeType: {
      type: String,
      enum: [
        'khussa', 'kohati', 'kolhapuri', 'peshawari',
        'heel', 'pump', 'stiletto', 'block-heel', 'wedge', 'platform',
        'flat', 'ballet-flat', 'loafer', 'moccasin', 'oxford', 'monk-strap',
        'sandal', 'chappal', 'slide', 'flip-flop', 'slipper', 'mule',
        'sneaker', 'trainer', 'jogger', 'running', 'basketball',
        'boot', 'ankle-boot', 'chelsea-boot', 'long-boot', 'combat',
        'court-shoe', 'formal-dress', 'bridal-footwear',
        'school-shoe', 'comfort', 'espadrille', 'boat-shoe', 'clogs', 'other'
      ]
    },

    /** Merchandising bucket (often matches collection handle) */
    subCategory: {
      type: String,
      enum: [
        'heels', 'flats', 'sandals', 'khussa', 'sneakers', 'boots', 'mules',
        'formal', 'casual', 'athletic', 'ethnic', 'kids', 'sale', 'other'
      ],
      default: 'other'
    },

    closure: {
      type: String,
      enum: ['slip-on', 'lace-up', 'buckle', 'velcro', 'zip', 'strap', 'elastic', 'none', 'other']
    },
    soleType: { type: String, trim: true },
    upperMaterial: { type: String, trim: true },
    liningMaterial: { type: String, trim: true },
    heelHeight: {
      type: String,
      enum: ['flat', 'low', 'mid', 'high', 'platform', 'unknown']
    },

    gender: {
      type: String,
      enum: ['women', 'men', 'kids', 'unisex'],
      default: 'women'
    },
    occasion: [{ type: String }],
    season: [{ type: String }],
    sportUse: { type: Boolean, default: false },

    colors: [{ type: String }],
    primaryColor: { type: String },
    exactColors: [{ type: String }],
    primaryExactColor: { type: String },
    colorFamily: {
      type: String,
      enum: ['red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'neutral', 'earth', 'teal', 'multicolor']
    },

    sizes: [{ type: String }],
    normalizedSizes: [NormalizedSizeSchema],
    widthFit: {
      type: String,
      enum: ['narrow', 'regular', 'wide', 'extra-wide', 'unknown']
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

ShoeProductSchema.index({ brand: 1, shoeType: 1 });
ShoeProductSchema.index({ gender: 1, occasion: 1 });
ShoeProductSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });

export default mongoose.models.ShoeProduct || mongoose.model('ShoeProduct', ShoeProductSchema);
