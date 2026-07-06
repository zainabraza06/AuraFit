import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6 },

    // Role-based access: "user" | "admin"
    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // Optional profile picture (Cloudinary URL). Doubles as the default
    // "person" image for AI tools like Virtual Try-On.
    profilePicture: { type: String, default: '' },

    // Style preferences (set during onboarding)
    preferences: {
      occasions: [{ type: String }],
      styles: [{ type: String }],
      favoriteColors: [{ type: String }],
      budget: { type: Number, default: 0 }
    },

    // Quick-access favorites list (product IDs)
    favoriteProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ClothingProduct' }]
  },
  { timestamps: true }
);

// ─── Hash password before save ────────────────────────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Compare plain password with hash ────────────────────────────────────────
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// ─── Omit password from JSON responses ───────────────────────────────────────
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.models.User || mongoose.model('User', UserSchema);
