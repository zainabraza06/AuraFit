# Agentic stylist and MCP

Two ways to put the catalog in front of an AI, built on the same five tools.

## The tools (`backend/services/agent/tools.js`)

All **read-only**. A test asserts it, so a future tool that writes data cannot be added by accident.

| Tool | What it does |
|---|---|
| `search_catalog` | Semantic + facet search across clothing, shoes, jewelry, watches. In-stock only. Optional catalog, gender, max price. |
| `get_product` | Details of one product (description, fabric, sizes, colours). |
| `suggest_accessories` | For one outfit: best shoe, jewelry set and watch, each with a reason. |
| `score_pair` | Compatibility (0-1) of two products: embedding, colour, occasion, style. |
| `get_wardrobe` | The signed-in user's saved items. Hidden from anonymous callers. |

Not exposed on purpose: try-on (costs money), favourites (writes), anything admin.

## 1. The agent: `POST /api/stylist/ask`

```json
{ "message": "a budget outfit for my cousin's mehndi, I love green, under 8000 PKR" }
```

Returns `{ answer, picks: [{ id, name, price, why, ... }], meta: { stopReason, steps, toolCalls, ms, requestId } }`.

How it runs (`backend/services/agent/graph.js`, a LangGraph state machine):

```
START -> decide --(tool)--> act --> decide ...
            |
            +--(final | budget exhausted)--> END
```

* **Budget**: at most 6 decisions, 5 tool calls, 45 s. Enforced in one place. A model that never stops calling tools is cut off and answered from what it already found.
* **Grounding**: the answer may only recommend product ids that a tool returned *in this run*. Invented ids are dropped (`droppedUngroundedPicks` in the trace).
* **Untrusted data**: tool output (product names/descriptions scraped from retailer sites) is wrapped in delimiters the model is told never to obey, and the wrapper cannot be forged from inside the text.
* **Degrades, never errors**: if every LLM provider is down, the answer is built from the best search hits and says so.
* **Cost control**: validated before the quota check (bad requests are free); 30/day signed-in, 5/day anonymous (`AGENT_DAILY_LIMIT`, `AGENT_ANON_DAILY_LIMIT`).

The fixed workflows (`/api/recommendations/*`, `/api/outfits`) stay the fast path for product pages. The agent is for open-ended requests where a few tool calls beat a fixed pipeline.

Try it without the API: `npm run agent:demo -- "your request"` (backend; uses the live catalog and a real LLM).

Measured on the live catalog (2026-11-17, Groq + Gemini): 3 tool calls, 4 LLM calls, all picks grounded; ~50 s the first time because the embedding model loads, a few seconds when warm.

## 2. MCP: let other AI clients use the catalog

### Local (Claude Desktop, IDEs): stdio

```json
{
  "mcpServers": {
    "aurafit": { "command": "node", "args": ["<repo>/backend/scripts/mcpStdio.js"] }
  }
}
```

Needs `backend/.env` with `MONGO_URI`. `MCP_USER_ID` (optional) also enables `get_wardrobe` for that user.

### Remote: HTTP at `/mcp`

Off unless `MCP_TOKEN` is set. Every request needs `Authorization: Bearer <MCP_TOKEN>` (constant-time comparison). Stateless: one server instance per request, no sessions to leak.

Verified: a real MCP client over stdio against the Atlas catalog (lists tools, searches, fetches a product), and over HTTP in the test suite (401 without the token, tool calls with it).

## Why LangGraph and not a bare loop, and why not LangChain chains

* LangGraph: explicit states and transitions make the budget and the fallbacks auditable, and the graph can grow (planner, critic, human-in-the-loop) without rewriting the loop.
* LangChain chains/retrievers: not used. Retrieval is our own hybrid search over local embeddings; wrapping it adds a dependency without a capability.
* The tool definitions are plain functions with zod schemas, so MCP and LangGraph are two thin adapters over the same code and neither is a lock-in.
