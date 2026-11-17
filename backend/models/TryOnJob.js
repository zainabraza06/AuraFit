import mongoose from 'mongoose';

/** Status + result metadata of a try-on job. Images are never stored here (only a hash of them in cacheKey). */
const TryOnJobSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  owner:     { type: String, required: true, index: true }, // callerKey: "u:<userId>" or "ip:<addr>"
  cacheKey:  { type: String, required: true, index: true },
  status:    { type: String, enum: ['queued', 'running', 'done', 'failed'], required: true, index: true },
  resultUrl: String,
  provider:  String,
  error:     String,
  reason:    String,
  cached:    Boolean,
  createdAt:  { type: Number, required: true },
  startedAt:  Number,
  finishedAt: { type: Number, index: true },
}, { collection: 'tryon_jobs', versionKey: false });

// (No TTL index: Mongo TTL needs a Date field and these are epoch numbers. Old jobs are pruned by the store.)

export default mongoose.models.TryOnJob || mongoose.model('TryOnJob', TryOnJobSchema);
