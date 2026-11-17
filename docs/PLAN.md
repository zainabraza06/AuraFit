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

## Status 2026-11-17

Everything below that is ticked has a test and, where it touches the real world, a live check. Items marked **measured, not built** were investigated and
deliberately left alone because the numbers say they are not needed yet. Items marked **blocked** need something only the owner can provide.

## P0 - Data correctness (extraction)
- [x] 0.1 Decode HTML entities and strip tags in names/descriptions at parse time (+ tests)
- [x] 0.2 Khaadi extractor returns real descriptions and stock status (verified live). Sizes: Khaadi only exposes set variants (3PC), so sizes stay empty by design
- [x] 0.3 Missing sizes: **explained, not a bug.** 177/189 Limelight and 85/101 Gul Ahmed sizeless rows are *unstitched* fabric (sizes do not apply); Khaadi's site exposes none. Real gap: ~52 stitched rows (2.5%) where the source page lists no sizes
- [x] 0.4 ALL-CAPS names (613 rows, 29%) are normalised to Title Case at parse time (`normalizeShoutingName`; codes like `FN6375` and `RTW`/`RTS` keep their case). Existing rows are rewritten by the next weekly refresh, or now with `npm run repair:catalog -- --apply`
- [x] 0.5 Colourways: found that **58% of clothing rows (1,213) share an identical brand+name** ("RTS | Shirt, Trouser & Dupatta" x110): generic titles, not colourways. Fix: `styleCode`/`styleGroup` derived from the URL slug (backfilled on 2,066 rows); search collapses colourways of one design. Only 7 designs are sold in 2+ colours, so collapsing rarely fires; `styleCode` is the useful part
- [x] 0.6 Repair script exists and was applied implicitly: the catalog was wiped and reloaded on 2026-11-16, so there was nothing left to repair
- [x] 0.7 Re-embed: every in-stock row has a current Qwen3 vector and a CLIP image vector
- [x] 0.8 Non-jewelry inside jewelry, non-watches inside watches: parsers fixed, rows purged
- [x] 0.9 All brands loaded except **Elan - blocked**: its SSL certificate expired on 2026-06-30 and the host serves a cPanel certificate. Re-checked 2026-11-17, still expired. Not bypassing TLS verification; the weekly job picks it up when they fix it

## P1 - Observability and admin (Prometheus + Grafana)
- [x] 1.1 API `/metrics`: HTTP latency/errors per route pattern, LLM outcomes + cooldown + latency + token counts, fallback counters, agent runs/steps, feedback events, LLM provider health
- [x] 1.2 Prometheus scrapes the API (token-protected); dashboards for API+LLM and pipeline; 33 panel queries validated against live Prometheus (dashboards not visually inspected; the new LLM/agent/feedback metrics are exported but not yet on a dashboard)
- [x] 1.3 Grafana secured: anonymous disabled, password from env; deploy refuses to run without real secrets
- [x] 1.4 Alert rules (10, incl. LLM provider self-test failure and total LLM outage). `promtool check rules`: SUCCESS, 10 rules. **No Alertmanager yet**, so alerts are visible but not routed anywhere
- [x] 1.5 Structured JSON request logs with `X-Request-Id` (route pattern only, no query strings or raw ids)

## P2 - Search correctness and speed
- [x] 2.0 Local embeddings (Qwen3, no API key)
- [x] 2.1 Golden query set: 35 predicate-judged queries (`npm run eval:search`), judgments written as attribute predicates so they survive every catalog refresh and recall is computed against the *whole* relevant set. First measurement P@10 0.788 / recall 0.821 / MRR 0.946 / nDCG 0.879. Runs in the weekly workflow and fails on a >0.05 regression vs `backend/eval/baseline.json`
- [x] 2.2 Vector index: **measured, not built.** Brute force over 256-dim vectors takes 3.4 ms (p50) at 3,400 products, 22 ms at 20,000, 143 ms at 100,000 (`npm run bench:vectors`). An index is justified past ~50k products; see [rag-architecture.md](rag-architecture.md)
- [x] 2.3 Embedding comparison: instead of downloading a rival model, measured the cheaper lever first, Matryoshka truncation of the current model: 256 dims is within noise of 1024 (P@10 0.806 vs 0.809) at 4x less data and memory; 128 is visibly worse. Default is now 256. A different model (multilingual comparison) was **not** evaluated
- [x] 2.4 Query-embedding LRU cache; candidate cache keyed by catalog only (gender/category applied in memory); warm-up at server start removes the 45 s first-query cost
- [x] 2.5 (new) Queries that name a product type ("choker", "heels", "watch") rank that catalog first; accessory queries were being embedded as "clothing outfit". P@10 0.788 -> 0.809, "kundan choker" no longer returns a shoe

## P3 - LLM gateway
- [x] 3.0 Provider chain repaired. Found live: Groq `llama-3.1-8b-instant` (404), Gemini `2.0-flash`/`2.5-flash` (retired), OpenRouter `llama-3.2-3b:free` (404), plus a hard-coded retired Gemini id in the wardrobe upload. New verified defaults: Groq `openai/gpt-oss-20b`, Gemini `3.5-flash-lite` / `3.5-flash` / `3.1-flash-lite`, OpenRouter `nvidia/nemotron-3.5-lightning:free`. `npm run llm:selftest`: 5 of 6 providers were healthy; Mistral returned 429 on every call (account rate limit), so **Mistral was removed entirely on 2026-11-17** and the chain is Groq, Gemini, OpenRouter (+ optional Ollama). Startup self-test + `llm_provider_up` gauge + alerts
- [x] 3.1 Circuit breaker shares cooldowns across API instances via Redis (best-effort, tested with a fake Redis; **not run against a real Redis**); HTTP 429 trips it immediately
- [x] 3.2 Ollama provider (set `OLLAMA_URL`); schema-validated JSON (`validate` option: invalid output moves to the next provider without tripping the breaker); test seam for fake providers
- [x] 3.3 Per-feature timeouts, latency histogram, token counters, one structured log line per call

## P4 - Async heavy work
- [x] 4.1 Try-on as a queued job: `POST /api/tryon/jobs` (202) + poll + SSE stream; bounded concurrency and queue, result cache by image hash (7 days), in-flight dedupe, per-owner cap, timeouts, stale-job recovery. Process-local queue (single API instance); the store interface is the seam for RabbitMQ workers. The synchronous endpoint is kept
- [x] 4.2 CLIP image vectors (local, 512-dim, ~150 ms/image) for every product photo (`npm run embed:images`, part of the weekly refresh); photo search fuses visual similarity with the description-based ranking; text-to-image works with the same vectors. **Not yet measured**: there is no golden set for photo search, so the benefit is verified functionally, not quantitatively

## P5 - Security
- [x] 5.1 SSRF guard on every server-side URL fetch (private/loopback/metadata IPs, redirects re-checked, DNS-rebinding-safe lookup, size caps), including the pipeline image worker
- [x] 5.2 Scraped text is wrapped as untrusted data in every LLM prompt and in agent tool results; delimiters cannot be forged; ungrounded product ids are dropped
- [x] 5.3 Uploads: declared-type allow-list + magic-byte check + size/file caps; per-caller daily quotas on try-on, image search, agent, outfit/style-advice and support; `npm audit` 11 -> 0 production vulnerabilities
- [x] 5.4 (new, found while testing) `POST /api/search/embed-all` was callable by anyone and re-embeds the whole catalog: now admin-only

## P6 - Feedback and evaluation
- [x] 6.1 `POST /api/feedback` -> Kafka `user.feedback` -> consumer -> Mongo: hashed actor (no raw ids/IPs), idempotent client event id, fail-open, 202. Unit + contract tests, and **run against the real stack (Kafka + consumer + Mongo): 200 events stored exactly once although 100 were published twice, 5 malformed events dead-lettered**. The same script runs in CI (`npm run feedbacktest`). The original product-event pipeline was re-run after the handler change: 3,000 products, zero loss, zero duplicates
- [x] 6.2 Search quality gate (smoke + golden eval) in the weekly workflow. Extraction goldens are the unit-test fixtures. **Not done:** golden sets for outfits and photo search

## P7 - Agentic stylist + MCP
- [x] 7.1 Tool layer: search_catalog, get_product, suggest_accessories, score_pair, get_wardrobe (all read-only, zod-validated, structured errors)
- [x] 7.2 LangGraph agent with step/tool/time budget, grounding, untrusted tool output, deterministic fallback; `POST /api/stylist/ask`; verified live (Groq + Gemini, 3 tool calls, all picks grounded). The deterministic workflows remain the fast path
- [x] 7.3 MCP server: stdio (verified live against Atlas with a real MCP client) and HTTP `/mcp` (bearer token, off unless `MCP_TOKEN` set). See [agent-and-mcp.md](agent-and-mcp.md)

## P8 - Scale and release
- [x] 8.1 Load test of the real API (`npm run load:api`, autocannon; **k6 was not available here**, so the plan's k6 was replaced). It found and fixed four real problems; results in "Load test" below
- [ ] 8.2 Deploy: **blocked** - needs a server and the `DEPLOY_*` / `METRICS_TOKEN` / `GRAFANA_ADMIN_PASSWORD` secrets. The deploy job has never run

## Still open (honest list)
- Elan (their certificate), a real server for 8.2
- Alertmanager routing; dashboards for the new LLM/agent/feedback metrics
- No golden set for photo search or outfits, so CLIP fusion and the agent are verified functionally, not by measured quality
- The Redis-shared LLM circuit breaker has been tested with a fake Redis only (not a real one)
- Catalog facts: heel queries have few real heels; no men's clothing in the catalog

## Load test (2026-11-17, `npm run load:api`, 20 concurrent connections x 10 s per scenario)

Real routes, real Atlas catalog (3,349 products), one Node process, run from a laptop over a home connection (so every database call includes that round trip; a server next to its database would be faster).

| Scenario | First run | After fixes | Target p95 |
|---|---|---|---|
| health | 2,783 req/s, 17 ms | 3,743 req/s, 10 ms | 50 ms |
| product list ("cached") | **5 req/s, p50 2.4 s, p97.5 6.7 s** | 924 req/s, p97.5 37 ms | 150 ms |
| featured ("cached") | 13 req/s, p97.5 3.5 s | 592 req/s, p97.5 47 ms | 150 ms |
| keyword search (repeated queries) | 2 req/s, p97.5 9.6 s, 33% errors | 526 req/s, p97.5 282 ms | 400 ms |
| keyword search (never-seen queries) | not measured | 48 req/s, p97.5 757 ms | informational |
| semantic search (warm) | 20 req/s, p97.5 1,637 ms | 63 req/s, p97.5 571 ms | 800 ms |

(autocannon exposes p97.5, the closest percentile above p95.) What the test found:

1. **The "cached" endpoints were not cached.** The response cache did nothing without Redis, so every request hit the database. Now an in-process cache with request coalescing is the fallback (Redis is still used when configured).
2. **A regression of mine:** the new CLIP vectors (512 floats per product) were being returned in every list/search response because the old projections only excluded `embedding`. Now `select: false`; a test pins it.
3. **Warm semantic search burned CPU rebuilding each product's lower-case text and colour table on every query.** Now computed once per cached product; rankings are unchanged (golden eval identical to the digit).
4. **Keyword search was uncached** and fans out to four catalogs: now cached for 30 s.

Not tested: concurrency above 20, mixed traffic, sustained (> 10 s) load, the agent and try-on endpoints (they depend on paid or rate-limited providers), and a multi-instance deployment.
