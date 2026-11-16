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

## Live run 2026-11-12 (Khaadi only, real writes to Atlas)

Khaadi before: 452 rows, 452 "in stock", 0 with a description.
Khaadi after: 938 rows, **509 in stock, all 509 with a real description**, 429 marked out of stock (old products no longer on the site; 486 genuinely new products inserted, 2 duplicate product codes). Whole clothing catalog: 1902 rows, 1473 in stock.

Three things the run exposed (all open):
1. **Embedding provider is down.** Hugging Face returns "Purchase pre-paid credits" - no new embeddings can be generated, and semantic search cannot embed user queries either. 486 new Khaadi rows have no embedding.
2. **Every LLM provider fails**: Mistral 429, OpenRouter/Groq 404, all three Gemini model ids 404 (stale model names). AI enrichment and QA repair silently do nothing.
3. **Sold-out items leaked into browse/search** (only the recommender filtered stock). Fixed and tested in this branch.

Also fixed: `hasChanged` ignored descriptions, so description-only changes were never written.

## Clean reload 2026-11-16 (catalog wiped and re-scraped, users kept)

| Catalog | Rows | In stock | Embedded (Qwen3, current) |
|---|---|---|---|
| clothing | 2,102 | 2,051 (51 sold out) | 2,051 / 2,051 |
| shoes | 583 | 583 | 583 / 583 |
| jewelry | 643 | 643 | 643 / 643 |
| watches | 72 | 72 | 72 / 72 |

Brands: Khaadi 513, Alkaram Studio 397, Zellbury 314, Limelight 295, Gul Ahmed 228, Beechtree 186, Maria B 94, Sana Safinaz 75. **Elan: 0** - its own SSL certificate has expired (not our bug; recovers by itself).
Cleanup found by checking the data: 44 clothing rows inside jewelry and 42 non-watches (shoes, scarves, suits, handbags) inside watches; parsers now reject them and `npm run purge:misclassified` removed the existing ones.
Verified with real queries through the full retrieval path (`npm run search:smoke`): relevant, in-stock results across the whole catalog (3,434 candidates searched).

**Known costs:** a cold search fetches every candidate with its 1024-dim vector (~30 MB) from the database and loads the 600 MB model: 45 s on the first query, then under 1 s. Fine next to the database, slow over a home connection. Next steps: warm up at server start, and store vectors as float32 / truncate (Qwen3 supports shorter dimensions) to cut the payload 2-4x.

## P0 - Data correctness (extraction)
- [x] 0.1 Decode HTML entities and strip tags in names/descriptions at parse time (+ tests)
- [x] 0.2 Khaadi extractor returns real descriptions and stock status (verified live). Sizes: Khaadi only exposes set variants (3PC), so sizes stay empty by design. **Also found: ~9/10 sampled Khaadi products are out of stock on the site while the DB says 100% in stock** - fixed in the extractor, takes effect on the next scrape
- [ ] 0.3 Missing sizes for Gul Ahmed and Limelight
- [ ] 0.4 Normalise ALL-CAPS names for display
- [x] 0.8 Non-jewelry items inside jewelry, and non-watches inside watches: parsers fixed, existing rows purged (tests use real names from production)
- [ ] 0.5 Group colorways (`styleGroup`) so search shows one card per style
- [~] 0.6 Repair script for existing rows: written and dry-run verified (325 rows). **Waiting for approval to `--apply` on the live database**
- [ ] 0.7 Re-embed new/repaired rows (**blocked by the embedding provider, see above**); re-run `profile:catalog`; accept when each baseline problem is 0 or explained
- [ ] 0.9 Run the remaining brands (Gul Ahmed, Alkaram, Maria B, Beechtree, Limelight...) so entity cleanup and stock status reach them (a full scrape also rewrites the &amp; rows, which makes the repair script redundant)

## P1 - Observability and admin (Prometheus + Grafana)
- [x] 1.1 API `/metrics`: HTTP latency/errors per route pattern, LLM outcomes + cooldown, fallback counters, runtime. (Still to add: LLM latency/cost, search latency, try-on outcomes, scraper run metrics)
- [x] 1.2 Prometheus scrapes the API (token-protected); dashboards for API+LLM and pipeline; all 33 panel queries validated against live Prometheus. (Search and data-quality dashboards come with P2/P0.7; dashboards were not visually inspected)
- [x] 1.3 Grafana secured: anonymous disabled, password from env; deploy refuses to run without real secrets
- [x] 1.4 Alert rules (8, validated with promtool). No Alertmanager yet, so they are visible but not routed anywhere
- [ ] 1.5 Structured request logs with request ids

**Found while doing P1:** the LLM circuit breaker never tripped (its failure counter reset on every call), so failing providers were retried on every request. Fixed + tested (commit 937629a).

## P2 - Search correctness and speed
- [ ] 2.0 **Unblock embeddings**: run the embedding model locally (same all-MiniLM-L6-v2 via transformers.js, so existing vectors stay compatible) or switch provider; add a health check + alert for it
- [ ] 2.1 Golden query set + recall@k / MRR harness (measure before changing anything)
- [ ] 2.2 Real vector index (replace the 400-doc brute force); filtered hybrid search
- [ ] 2.3 Multilingual / better embedding model, compared on the golden set
- [ ] 2.4 Query-embedding cache

## P3 - LLM gateway
- [ ] 3.0 **Repair the provider chain**: replace stale model ids (OpenRouter, Groq, Gemini), handle Mistral's rate limit, and add a startup self-test that fails loudly
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
