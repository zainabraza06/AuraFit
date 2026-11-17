/**
 * searchWarmup.js — pay the cold-start cost at boot instead of on the first user's search.
 *
 * A cold semantic search loads the 600 MB embedding model and pulls every catalog's candidate vectors
 * (~30 MB) from the database: ~45 s over a home connection. Running one throwaway search at startup
 * does both, in the background, so the first real query is as fast as the hundredth.
 */
import { getEmbedding, searchAcrossCatalogs } from './crossCatalogSearch.js';
import { analyzeSearchQuery, buildSemanticQueryText } from './searchQueryIntel.js';
import { isEmbeddingConfigured } from './embeddings.js';

/** @returns {Promise<{ ok: boolean, ms: number, candidates?: number, skipped?: string, error?: string }>} */
export async function warmUpSearch({ log = console.log } = {}) {
  if (!isEmbeddingConfigured()) return { ok: false, ms: 0, skipped: 'embeddings not configured' };
  const started = Date.now();
  try {
    const signals = analyzeSearchQuery('red lawn suit');
    const embedding = await getEmbedding(buildSemanticQueryText(signals));
    const { totalCandidates } = await searchAcrossCatalogs(signals, embedding, { limit: 1 });
    const ms = Date.now() - started;
    log(JSON.stringify({ level: 'info', msg: 'search_warmup', ms, candidates: totalCandidates }));
    return { ok: true, ms, candidates: totalCandidates };
  } catch (e) {
    const ms = Date.now() - started;
    log(JSON.stringify({ level: 'warn', msg: 'search_warmup_failed', ms, error: e.message }));
    return { ok: false, ms, error: e.message };
  }
}
