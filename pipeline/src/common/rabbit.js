import amqp from 'amqplib';
import { config } from './config.js';
import { QUEUES } from './topics.js';
import { retry } from './retry.js';

/**
 * RabbitMQ topology: durable work queues + one dead-letter queue.
 * Jobs are retried by republishing with an incremented attempt counter, so a
 * poison job ends up in jobs.dlq instead of looping forever.
 */
export async function connectRabbit(url = config.rabbitUrl) {
  const conn = await retry(() => amqp.connect(url), { attempts: 15, delayMs: 1000 });
  // Confirm channel: a publish resolves only once the broker has accepted (and, for persistent
  // messages on durable queues, stored) it. Without this a crash right after publish() loses the job.
  const ch = await conn.createConfirmChannel();

  const send = (queue, buffer, options) => new Promise((resolve, reject) => {
    ch.sendToQueue(queue, buffer, options, (err) => (err ? reject(err) : resolve()));
  });
  for (const q of Object.values(QUEUES)) await ch.assertQueue(q, { durable: true });

  return {
    ch,
    close: async () => { await ch.close(); await conn.close(); },

    /** Resolves when the broker confirms the message. */
    publish(queue, job, headers = {}) {
      return send(queue, Buffer.from(JSON.stringify(job)), {
        persistent: true,
        contentType: 'application/json',
        headers: { attempts: 0, ...headers },
      });
    },

    async depth(queue) {
      return (await ch.checkQueue(queue)).messageCount;
    },

    /** handler(job, {attempts}) resolves => ack; rejects => retry up to maxAttempts, then dead-letter. */
    async consume(queue, handler, { prefetch = 5, maxAttempts = config.maxRetries, onOutcome = () => {} } = {}) {
      await ch.prefetch(prefetch);
      await ch.consume(queue, async (msg) => {
        if (!msg) return;
        const attempts = Number(msg.properties.headers?.attempts || 0);
        try {
          const outcome = await handler(JSON.parse(msg.content.toString()), { attempts });
          onOutcome(outcome || 'done');
          ch.ack(msg);
        } catch (err) {
          if (attempts + 1 >= maxAttempts) {
            await send(QUEUES.deadLetter, msg.content, {
              persistent: true,
              headers: { origin: queue, error: String(err.message).slice(0, 300) },
            });
            onOutcome('dead');
          } else {
            await send(queue, msg.content, { persistent: true, headers: { attempts: attempts + 1 } });
            onOutcome('retried');
          }
          ch.ack(msg);
        }
      });
    },
  };
}
