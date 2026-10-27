# Test results

Reports from `npm run loadtest` and `npm run failuretest` (run from `pipeline/`) are written here as timestamped JSON.
Every number quoted in the main README comes from one of these files.

## Environment

Docker Desktop on a single Windows laptop. One Kafka broker (KRaft, 3 partitions per topic), RabbitMQ, Redis, MongoDB,
**2 consumer replicas + 1 worker**, and the load generator all share the same machine. Absolute throughput therefore
understates what dedicated hardware would do; the integrity results (loss / duplicates) do not depend on it.

## Runs

Workload per run: 20,000 `product.discovered` + 2,000 `product.price_changed` (22,000 unique events, 2,000 of them price drops).

| Run | Fault injected | Stored | Lost | Duplicate rows | Notifications (expected 2,000) | Final prices correct | Throughput |
|---|---|---|---|---|---|---|---|
| Load test (x2) | +1,000 redelivered duplicates, +50 malformed messages | 22,000 | 0 | 0 | 2,000 | 2,000 / 2,000 | 328 and 383 events/s |
| Crash, 1 of 2 consumers | `SIGKILL` at ~40%, 8 s down, 15,711 messages unprocessed at kill | 22,000 | 0 | 0 | 2,000 | 2,000 / 2,000 | 269 events/s incl. recovery |
| Crash, 1 of 2 consumers (rerun) | `SIGKILL`, 18,382 messages unprocessed at kill | 22,000 | 0 | 0 | 2,000 | 2,000 / 2,000 | 325 events/s incl. recovery |
| Crash, all consumers | `SIGKILL` both, 8 s down, 16,733 unprocessed at kill | 22,000 | 0 | 0 | 2,000 | 2,000 / 2,000 | 265 events/s incl. recovery |

In the load test all 50 malformed messages ended up in the dead-letter topic and none were stored.
Throughput is end to end: first publish until every event is stored and every notification delivered.

## What the tests found (and fixed)

Passing on the first try would have meant the tests were too weak. Running them against the real stack found three genuine bugs
that unit tests with fakes could not:

1. **Lost jobs on crash.** The first crash run stored all 22,000 events but only 1,976 of 2,000 notifications: 24 jobs were lost.
   RabbitMQ publishing had no broker confirms, so `publish()` returned before the broker had the message and the event was then
   marked done. Fixed with a confirm channel that is awaited before the event is completed.
2. **Skipped work after a crash.** A consumer killed between "event stored" and "jobs enqueued" would, on redelivery, see its own
   record and drop the event as a duplicate. Fixed with a two-phase event record (`pending` -> `done`, completed only after the jobs
   are confirmed).
3. **Stale overwrites.** `discovered` and `price_changed` are different Kafka topics with no ordering between them, so an older event
   could overwrite a newer price. State updates are now guarded by the event's `occurredAt`, and the tests check final prices.

Throughput was also profiled: consumers were CPU-bound (about one core each), mostly in Mongoose document handling, so the hot path now uses
the raw driver and processes each fetched batch with bounded concurrency.

## Scope of the claim

Verified: a consumer, or every consumer, being killed with `SIGKILL` mid-run on a single broker. Not tested: broker failure,
Mongo or Redis outages, network partitions, multi-broker replication, or sustained load beyond 22,000 events.
