import mongoose from 'mongoose';
import { config } from './config.js';

const ProductState = mongoose.model('PipelineProduct', new mongoose.Schema({
  productUrl: { type: String, required: true, unique: true },
  brand: String,
  name: String,
  price: Number,
  currency: String,
  imageUrl: String,
  hostedImageUrl: String,
  firstSeenAt: Date,
  lastEventAt: Date,
}, { collection: 'pipeline_products' }));

// The unique eventId index is the durable idempotency guarantee.
const ProcessedEvent = mongoose.model('PipelineEvent', new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  type: String,
  productUrl: { type: String, index: true },
  occurredAt: Date,
  payload: mongoose.Schema.Types.Mixed,
  // pending = state applied but jobs not yet confirmed enqueued; done = fully processed
  status: { type: String, enum: ['pending', 'done'], default: 'done' },
  priceDrop: mongoose.Schema.Types.Mixed,
}, { collection: 'pipeline_events', timestamps: { createdAt: 'storedAt', updatedAt: false } }));

const Notification = mongoose.model('PipelineNotification', new mongoose.Schema({
  eventId: { type: String, unique: true },
  productUrl: String,
  message: String,
  pct: Number,
}, { collection: 'pipeline_notifications', timestamps: true }));

// Shopper feedback (clicks, saves, thumbs...). Unique eventId = idempotent under redelivery.
const Feedback = mongoose.model('PipelineFeedback', new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  action: { type: String, index: true },
  actor: { type: String, index: true },
  surface: String,
  productUrl: { type: String, index: true },
  catalog: String,
  query: String,
  position: Number,
  occurredAt: { type: Date, index: true },
}, { collection: 'pipeline_feedback', timestamps: { createdAt: 'storedAt', updatedAt: false } }));

export const models = { ProductState, ProcessedEvent, Notification, Feedback };

export async function connectMongo(uri = config.mongoUri) {
  await mongoose.connect(uri);
  await Promise.all([ProductState.init(), ProcessedEvent.init(), Notification.init(), Feedback.init()]);
  return mongoose.connection;
}
