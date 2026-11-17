/** Kafka topics and RabbitMQ queues used across services. */
export const TOPICS = {
  discovered: 'product.discovered',
  priceChanged: 'product.price_changed',
  deadLetter: 'product.events.dlq',
  feedback: 'user.feedback',
};

export const EVENT_TYPES = {
  DISCOVERED: 'product.discovered',
  PRICE_CHANGED: 'product.price_changed',
  FEEDBACK: 'user.feedback',
};

export const QUEUES = {
  image: 'jobs.image',
  notify: 'jobs.price_drop_notification',
  deadLetter: 'jobs.dlq',
};
