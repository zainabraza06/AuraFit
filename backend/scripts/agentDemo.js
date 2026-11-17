/**
 * agentDemo.js — run the stylist agent once against the live catalog and a real LLM.
 *   npm run agent:demo -- "a budget outfit for my cousin's mehndi, I love green, under 8000 PKR"
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { runStylistAgent } from '../services/agent/graph.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
const message = process.argv.slice(2).join(' ') || "a budget outfit for my cousin's mehndi, I love green, under 8000 PKR";

await mongoose.connect(process.env.MONGO_URI);
console.log(`Request: ${message}\n`);
const r = await runStylistAgent({ message });
console.log(`Answer: ${r.answer}\n`);
r.picks.forEach((p) => console.log(` - [${p.catalog}] ${p.brand} | ${p.name} | PKR ${p.price} | ${p.why}`));
console.log(`\nstop=${r.stopReason} steps=${r.steps} toolCalls=${r.toolCalls} ungroundedDropped=${r.droppedUngroundedPicks} ${r.ms} ms`);
console.log('trace:', r.trace.map((t) => `${t.tool}${t.ok ? '' : '(failed)'} ${JSON.stringify(t.args)}`).join('\n       '));
await mongoose.disconnect();
process.exit(0);
