import mongoose from 'mongoose';

const SystemLogSchema = new mongoose.Schema(
  {
    type:    { type: String, enum: ['error', 'warning', 'info'], default: 'error' },
    source:  { type: String, enum: ['recommendation', 'llm', 'scraper', 'user_escalation'], required: true },
    message: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed },
    // populated for user_escalation entries
    userMessage: { type: String },
    userEmail:   { type: String },
    // resolution
    resolved:    { type: Boolean, default: false },
    resolvedBy:  { type: String },
    resolvedAt:  { type: Date },
    adminNote:   { type: String },
  },
  { timestamps: true }
);

SystemLogSchema.index({ source: 1, createdAt: -1 });
SystemLogSchema.index({ resolved: 1 });

export default mongoose.model('SystemLog', SystemLogSchema);
