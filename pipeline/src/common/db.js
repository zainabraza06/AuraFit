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
}, { collection: 'pipeline_events', timestamps: { createdAt: 'storedAt', updatedAt: false } }));

const Notification = mongoose.model('PipelineNotification', new mongoose.Schema({
  eventId: { type: String, unique: true },
  productUrl: String,
  message: String,
  pct: Number,
}, { collection: 'pipeline_notifications', timestamps: true }));

export const models = { ProductState, ProcessedEvent, Notification };

export async function connectMongo(uri = config.mongoUri) {
  await mongoose.connect(uri);
  await Promise.all([ProductState.init(), ProcessedEvent.init(), Notification.init()]);
  return mongoose.connection;
}
