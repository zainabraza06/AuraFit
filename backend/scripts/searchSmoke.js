/**
 * searchSmoke.js — end-to-end check of semantic search against the LIVE catalog.
 *
 *   npm run search:smoke
 *
 * Embeds real queries with the local Qwen model and runs them through the same code path the API uses
 * (query embedding -> whole-catalog candidates -> hybrid ranking). Prints the top results and fails if
 * a query returns nothing, returns a sold-out product, or the top hit is in the wrong catalog.
 * Run it after a refresh to see that retrieval actually works, not just that vectors exist.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// [query, catalog the top result must come from (undefined = any)]
export const SMOKE_QUERIES = [
  ['black embroidered lawn suit', 'clothing'],
  ['white kurta for eid', 'clothing'],
  ['red bridal lehnga with heavy work', 'clothing'],
  ['navy blue heels for a wedding', 'shoes'],
  ['comfortable flat sandals', 'shoes'],
  ['gold jhumka earrings', 'jewelry'],
  ['pearl necklace set', 'jewelry'],
  ['stitched 3 piece in pastel colours for summer', 'clothing'],
];

export function checkResults(query, expectedCatalog, results) {
  const problems = [];
  if (!results.length) return [`"${query}": no results`];
  const soldOut = results.filter((r) => r.inStock === false);
  if (soldOut.length) problems.push(`"${query}": ${soldOut.length} sold-out product(s) returned`);
  if (expectedCatalog && results[0].catalog !== expectedCatalog) {
    problems.push(`"${query}": top result is from "${results[0].catalog}" (expected "${expectedCatalog}")`);
  }
  return problems;
}

export async function runSmoke(log = console.log) {
  const { getEmbedding, searchAcrossCatalogs } = await import('../services/crossCatalogSearch.js');
  const { analyzeSearchQuery, buildSemanticQueryText } = await import('../services/searchQueryIntel.js');
  const problems = [];

  for (const [query, expected] of SMOKE_QUERIES) {
    const signals = analyzeSearchQuery(query);
    const t0 = Date.now();
    const embedding = await getEmbedding(buildSemanticQueryText(signals));
    const { results, totalCandidates } = await searchAcrossCatalogs(signals, embedding, { limit: 5 });
    const ms = Date.now() - t0;
    log(`\n"${query}"  (${ms} ms, ${totalCandidates} candidates)`);
    results.slice(0, 3).forEach((r, i) =>
      log(`  ${i + 1}. [${r.catalog}] ${r.brand} - ${String(r.name).slice(0, 60)}  PKR ${r.price}  score ${r.relevanceScore}`)
    );
    problems.push(...checkResults(query, expected, results));
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(runSmoke)
    .then((problems) => {
      console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join('\n- ')}` : '\nAll smoke queries returned relevant, in-stock results.');
      process.exitCode = problems.length ? 2 : 0;
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
      process.exit();
    });
}
