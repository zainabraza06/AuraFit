# Demo video shot list (about 3 minutes)

1. **Start (15s)** - `docker compose up --build`; show all containers healthy.
2. **Dashboard (15s)** - open Grafana, point out lag, queue depth, error rate, p95 latency, all at idle.
3. **Ingest (30s)** - run the scraper with `PIPELINE_ENABLED=true`; watch throughput and the RabbitMQ queues move.
4. **Load test (40s)** - `npm run loadtest -- --products=20000`; show the PASS line and the report JSON.
5. **Crash (60s)** - `npm run failuretest -- --products=20000 --mode=one`; on the dashboard show the replica count drop, lag spike, then recover.
6. **Result (20s)** - show "0 lost, 0 duplicated" and the DLQ count matching the malformed messages sent.

Record at 1080p, keep Grafana's time range at 5 minutes, and link the video from the README.
