import { config } from '../common/config.js';
import { createLogger } from '../common/logger.js';
import { createRedis } from '../common/redis.js';
import { connectMongo, models } from '../common/db.js';
import { connectRabbit } from '../common/rabbit.js';
import { metrics, startMetricsServer } from '../common/metrics.js';
import { QUEUES } from '../common/topics.js';
import { idempotent } from './idempotent.js';
import { createImageJob, fetchImage, transform, makeCloudinaryUploader } from './imageJob.js';
import { createNotifyJob } from './notifyJob.js';

const logger = createLogger('worker');

async function main() {
  startMetricsServer();
  await connectMongo();
  const redis = createRedis();
  const rabbit = await connectRabbit();

  const imageJob = createImageJob({
    fetchImage,
    transform,
    upload: makeCloudinaryUploader(),
    recordResult: (productUrl, r) =>
      models.ProductState.updateOne({ productUrl }, { $set: { hostedImageUrl: r.hostedUrl } }),
  });

  const notifyJob = createNotifyJob({
    logger,
    // upsert on eventId: re-running the job can never create a second notification
    deliver: (n) => models.Notification.updateOne({ eventId: n.eventId }, { $set: n }, { upsert: true }),
  });

  const opts = (queue) => ({
    prefetch: Number(process.env.WORKER_PREFETCH || 5),
    onOutcome: (outcome) => metrics.jobs.inc({ queue, outcome }),
  });

  await rabbit.consume(QUEUES.image, idempotent(redis, QUEUES.image, imageJob), opts(QUEUES.image));
  await rabbit.consume(QUEUES.notify, idempotent(redis, QUEUES.notify, notifyJob), opts(QUEUES.notify));
  logger.info('worker running', { queues: [QUEUES.image, QUEUES.notify], rabbit: config.rabbitUrl.replace(/\/\/.*@/, '//***@') });

  const shutdown = async () => { await rabbit.close(); redis.disconnect(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('worker crashed', { err: err.message });
  process.exit(1);
});
