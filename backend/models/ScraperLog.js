import mongoose from 'mongoose';

/**
 * ScraperLog — records the outcome of each scrape run.
 * Used by the Admin Dashboard to monitor health and debug failures.
 */
const ScraperLogSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true }, // e.g. "2026-05-09T03:00:00Z"
    status: {
      type: String,
      enum: ['running', 'completed', 'failed', 'partial'],
      default: 'running'
    },
    triggeredBy: { type: String, default: 'cron' }, // "cron" | "admin" | "manual"
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    durationMs: { type: Number },

    // Aggregate stats
    stats: {
      totalBrands: { type: Number, default: 0 },
      totalInserted: { type: Number, default: 0 },
      totalUpdated: { type: Number, default: 0 },
      totalSkipped: { type: Number, default: 0 },
      totalFailed: { type: Number, default: 0 }
    },

    // Per-brand breakdown
    brandResults: [
      {
        brand: String,
        url: String,
        inserted: { type: Number, default: 0 },
        updated: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        strategy: String, // "shopify-collection" | "shopify-all" | "html" | "failed"
        error: String
      }
    ],

    // Failed URLs for re-investigation
    failedUrls: [{ url: String, reason: String }],

    // General error if the whole run crashes
    error: { type: String }
  },
  { timestamps: true }
);

export default mongoose.models.ScraperLog || mongoose.model('ScraperLog', ScraperLogSchema);
