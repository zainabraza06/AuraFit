/**
 * llmSelfTest.js — call every configured LLM provider once and report which work.
 *   npm run llm:selftest
 * Exit code 1 when no provider is healthy.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { selfTestProviders } from '../services/llmHealth.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const { results, healthy } = await selfTestProviders({ log: () => {} });
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id.padEnd(26)} ${String(r.ms).padStart(6)} ms ${r.error || ''}`);
console.log(`\n${healthy}/${results.length} providers healthy`);
process.exit(healthy > 0 ? 0 : 1);
