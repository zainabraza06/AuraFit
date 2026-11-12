# How retrieval (RAG) works in AuraFit

RAG = **retrieve** the relevant products first, then let rules and an LLM work only on what was retrieved.
AuraFit already had this shape; the embedding model was the only part that needed replacing.

```mermaid
flowchart LR
  subgraph Weekly["Weekly refresh (GitHub Actions)"]
    S[Scrape 14 brands] --> C[Clean text\nentities, tags]
    C --> D[Upsert + stock sweep\nnew / changed / sold out]
    D --> T[Build embedding text\nname, fabric, colour,\noccasion, description]
    T --> E[Qwen3-Embedding-0.6B\n1024-dim, local]
    E --> M[(MongoDB\nvector + embeddingModel)]
  end

  subgraph Query["Every search"]
    Q[User query / photo caption] --> I[Intent + facets\ncolour, occasion, budget]
    I --> QE[Embed query\nwith task instruction]
    M --> F[Candidates:\nin stock + same model\n+ gender / category]
    QE --> R[Hybrid score\ncosine + facets]
    F --> R
    R --> X[Relax constraints\nif too few results]
    X --> O[Results]
    O -. grounded in retrieved products .-> L[LLM explanation /\nstylist]
  end
```

## Was a big architecture change needed?

No. Only three places ever produced embeddings, so the change is one module.

| Part | Before | Now |
|---|---|---|
| Embedding model | MiniLM via Hugging Face API (384-dim, English, paid credits ran out) | **Qwen3-Embedding-0.6B**, in-process, 1024-dim, multilingual, no API key |
| Query vs document | same text both sides | queries carry a task instruction, documents are plain text (what Qwen3 is trained for) |
| Stored vector | no record of which model made it | every row stores `embeddingModel`; search only compares vectors from the current model |
| Re-embedding | manual script, API calls | `embedPending` finds rows with no vector **or an old model** and fixes them; part of the weekly run |
| Candidate set | first 400 rows per catalog, re-read from Mongo on every query | whole catalog, cached in memory as Float32 for 5 minutes |
| Stock | ignored by search | sold-out products excluded from every search path |

Unchanged: scraping, text cleaning, the facet/hybrid scoring, constraint relaxation, the recommender and the stylist flows.

## Why Qwen3-Embedding

- **Multilingual**: product text and queries mix English with Roman Urdu terms (shalwar, dupatta, lehnga), where an English-only MiniLM is weak.
- **Instruction-aware**: you tell it the task ("retrieve fashion products matching this query"), which improves retrieval.
- **Local and free**: runs on CPU through transformers.js, so no key, no quota and no extra server. The same code works on a laptop and on a CI runner.
- Measured here: about 0.2 s per text on CPU, 1024 dimensions, sensible similarities (query "black embroidered lawn suit" vs a lawn-suit description 0.62, vs a heels description 0.40).

### Costs to know about

- **Memory**: the quantised model needs roughly 1-2 GB of RAM inside whatever process embeds. The weekly job runs it on a CI runner (fine). For the **API server**, query embedding also needs the model; on a small host (for example a 512 MB free tier) run it on a larger instance or move query embedding into a small separate service.
- **First start** downloads about 600 MB (cached afterwards in `backend/.model-cache`).
- **Switching models** later only means changing `EMBEDDING_MODEL_ID`/repo: `npm run embed:all` then re-embeds everything stale. Vectors of different models are never mixed.

## What is still brute force

Ranking is exact cosine in Node over the cached candidates. At a few thousand products that is fast (milliseconds once cached).
When the catalog grows past roughly 20-50k rows, move candidates into a real vector index (Atlas Vector Search or pgvector); the provider, model tagging and
weekly job above stay exactly as they are. This is step 2.2 in [PLAN.md](PLAN.md).

## The weekly loop

`npm run refresh:catalog` (scheduled in `.github/workflows/weekly-refresh.yml`):

1. scrape clothing, shoes, watches, jewelry (new products are inserted, changed ones updated);
2. sweep: products no longer on the retailer's site are marked out of stock, **unless the run looks blocked or incomplete** (then nothing is marked and a warning is logged);
3. embed everything new or changed;
4. print a summary, and fail the job if a catalog lost most of its in-stock products or any embedding failed.
