# Production hardening plan

Each step has an acceptance check. Work one step at a time; tick it only when the check passes.
Baseline numbers come from `npm run profile:catalog` (backend), measured 2026-11-12.

## Baseline (before any fix)

| Problem | Measured |
|---|---|
| Khaadi products with empty description **and** no sizes | 452 / 452 (32% of clothing) |
| Text with leaked HTML entities (`&amp;`, `&nbsp;`) | Alkaram 120/221, Gul Ahmed 120/160, Maria B 30/47, Beechtree 10/156 |
| Clothing with no sizes | 636 / 1416 (Khaadi 452, Gul Ahmed 97, Limelight 82) |
| Same-name colorways shown as separate results | 670 extra rows (not errors; need grouping) |
| Watches catalog | 0 products |
| Semantic search | brute-force cosine over the first 400 docs per catalog (not ANN) |
| LLM rate limit / circuit breaker | per process, not shared |
| Try-on | synchronous inside the HTTP request |

## P0 - Data correctness (extraction)
- [x] 0.1 Decode HTML entities and strip tags in names/descriptions at parse time (+ tests)
- [x] 0.2 Khaadi extractor returns real descriptions and stock status (verified live). Sizes: Khaadi only exposes set variants (3PC), so sizes stay empty by design. **Also found: ~9/10 sampled Khaadi products are out of stock on the site while the DB says 100% in stock** - fixed in the extractor, takes effect on the next scrape
- [ ] 0.3 Missing sizes for Gul Ahmed and Limelight
- [ ] 0.4 Normalise ALL-CAPS names for display
- [ ] 0.8 Non-jewelry items inside the jewelry catalog (e.g. perfume) - reclassify or exclude
- [ ] 0.5 Group colorways (`styleGroup`) so search shows one card per style
- [~] 0.6 Repair script for existing rows: written and dry-run verified (325 rows). **Waiting for approval to `--apply` on the live database**
- [ ] 0.7 Re-embed repaired rows; re-run `profile:catalog`; **accept when each baseline problem above is 0 or explained**

## P1 - Observability and admin (Prometheus + Grafana)
- [ ] 1.1 API `/metrics` (HTTP latency/errors per route, LLM calls/latency/cost/fallbacks, search latency, try-on outcomes, scraper runs)
- [ ] 1.2 Prometheus scrapes the API; Grafana dashboards: API (RED), LLM, search, scraper/data quality
- [ ] 1.3 Grafana secured: no anonymous admin, password from env
- [ ] 1.4 Alert rules (error rate, p95 latency, LLM fallback rate, consumer lag, DLQ growth)
- [ ] 1.5 Structured request logs with request ids

## P2 - Search correctness and speed
- [ ] 2.1 Golden query set + recall@k / MRR harness (measure before changing anything)
- [ ] 2.2 Real vector index (replace the 400-doc brute force); filtered hybrid search
- [ ] 2.3 Multilingual / better embedding model, compared on the golden set
- [ ] 2.4 Query-embedding cache

## P3 - LLM gateway
- [ ] 3.1 Redis-backed rate limit + circuit breaker shared across instances
- [ ] 3.2 Ollama provider for local dev/tests (env switch); schema-validated JSON everywhere
- [ ] 3.3 Per-feature timeouts, token/cost logging

## P4 - Async heavy work
- [ ] 4.1 Try-on as a queued job with status/SSE, quotas, result cache by image hash
- [ ] 4.2 Image search: image embeddings in the same space as text (CLIP/SigLIP)

## P5 - Security
- [ ] 5.1 SSRF guard on every server-side URL fetch (incl. pipeline image worker)
- [ ] 5.2 Treat scraped text as untrusted in prompts (prompt-injection hardening)
- [ ] 5.3 Upload validation, per-user quotas on costly endpoints, dependency audit

## P6 - Feedback and evaluation
- [ ] 6.1 Feedback events (save, click, thumbs, try-on) into the Kafka pipeline
- [ ] 6.2 Offline eval in CI (golden sets for search, outfits, extraction)

## P7 - Agentic stylist + MCP
- [ ] 7.1 Tool layer (search, score_outfit, accessories, wardrobe, price_history, try-on)
- [ ] 7.2 Agent loop with step/token budget; keep the deterministic workflow as the fast path
- [ ] 7.3 MCP server exposing the same tools (auth, read-only by default)

## P8 - Scale and release
- [ ] 8.1 Load test the API (k6) with p95 targets; fix what it finds
- [ ] 8.2 Deploy (needs a server) and record the live URL
