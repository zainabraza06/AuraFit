# Why each piece is in the stack

The rule: every component has to do a job the others can't do well.

| Component | Job here | Why not something else |
|---|---|---|
| **Kafka** | The event log between scrapers and consumers | Events need to be **replayable** (a new consumer can rebuild state from offset 0), **ordered per product** (key = `productUrl`), and **buffered** when consumers are slow or down. RabbitMQ deletes messages once acked, so it can't replay. |
| **RabbitMQ** | Background jobs: image processing, notifications | Jobs are one-off units of work. They need per-message ack, retry and dead-lettering, and a competing-consumers queue, which RabbitMQ gives without managing offsets or partitions. Kafka would make retrying a single failed image awkward. |
| **Redis** | API cache, rate limiting, dedupe fast-path, job locks | Needs sub-millisecond reads, atomic `SET NX PX` for locks and TTL expiry. Not the source of truth: losing Redis must never lose or duplicate data, so Mongo's unique index backs every Redis check. |
| **MongoDB** | Durable event record and current product state | Already the app's database. The unique `eventId` index is what makes the pipeline effectively-once. |
| **Prometheus + Grafana** | Lag, queue depth, error rate, latency | Consumer lag is the one number that says whether the pipeline is keeping up. |
| **Docker Compose** | One-command local stack | Kafka + RabbitMQ + Redis + Mongo + 4 services is not something anyone will start by hand. |

## Kafka vs RabbitMQ in one line

Kafka is a **log you read**; RabbitMQ is a **queue you drain**. Events (facts that happened, to be kept and replayed) go in the log; jobs (work to be done once, then forgotten) go in the queue.
