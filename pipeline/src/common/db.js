import mongoose from 'mongoose';
import { config } from './config.js';

const ProductState = mongoose.model('PipelineProduct', new mongoose.Schema({
  productUrl: { type: String, required: true, unique: true },
  brand: String,
  name: String,
  price: Number,
  currency: String,
  imageUrl: String,
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

export const models = { ProductState, ProcessedEvent };

export async function connectMongo(uri = config.mongoUri) {
  await mongoose.connect(uri);
  await Promise.all([ProductState.init(), ProcessedEvent.init()]);
  return mongoose.connection;
}
