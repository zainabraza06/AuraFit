/**
 * evalAgent.js — run the stylist agent on the tasks in eval/agent-tasks.json against the LIVE catalog and a real
 * LLM, and grade every answer with programmatic checks (services/agentEval.js).
 *
 *   npm run eval:agent                     # all tasks
 *   npm run eval:agent -- --only injection,white-kurta
 *   npm run eval:agent -- --write-baseline
 *
 * LLM output varies run to run, so the regression gate is deliberately loose (see TOLERANCE). Costs free-tier LLM
 * calls (about 4 per task). Writes eval/agent-results.json with every run, for inspection.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { runStylistAgent } from '../services/agent/graph.js';
import { judgeAgentRun, taskPassed, summarizeAgentEval } from '../services/agentEval.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TASKS = path.resolve(__dirname, '../eval/agent-tasks.json');
const RESULTS = path.resolve(__dirname, '../eval/agent-results.json');
const BASELINE = path.resolve(__dirname, '../eval/baseline-agent.json');
const TOLERANCE = 0.15; // fraction of tasks that may flip between runs before we call it a regression
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };

async function stockLookup(ids) {
  const { CATALOGS } = await import('../services/crossCatalogSearch.js');
  const map = new Map();
  for (const { Model } of CATALOGS) {
    const docs = await Model.find({ _id: { $in: ids.filter((i) => /^[a-f0-9]{24}$/i.test(i)) } }, 'inStock').lean();
    docs.forEach((d) => map.set(String(d._id), d.inStock !== false));
  }
  return map;
}

async function main() {
  const only = arg('only', '')?.split(',').filter(Boolean);
  const tasks = JSON.parse(fs.readFileSync(TASKS, 'utf8')).filter((t) => !only.length || only.includes(t.id));
  await mongoose.connect(process.env.MONGO_URI);

  const rows = [];
  for (const task of tasks) {
    process.stdout.write(`${task.id.padEnd(22)} `);
    let run;
    try {
      run = await runStylistAgent({ message: task.message });
    } catch (e) {
      run = { stopReason: `crashed: ${e.message}`, picks: [], droppedUngroundedPicks: 0, ms: 0, toolCalls: 0, steps: 0, answer: '' };
    }
    const stockById = await stockLookup(run.picks.map((p) => String(p.id)));
    const checks = judgeAgentRun(task, run, { stockById });
    const passed = taskPassed(checks);
    rows.push({ id: task.id, message: task.message, passed, checks, ms: run.ms, toolCalls: run.toolCalls, steps: run.steps, stopReason: run.stopReason, answer: run.answer, picks: run.picks.map((p) => ({ id: p.id, catalog: p.catalog, name: p.name, price: p.price, color: p.color })) });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${String(run.ms).padStart(6)} ms  ${run.toolCalls} tools  ${run.picks.length} picks${passed ? '' : `   <- ${checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}`}`);
  }

  const s = summarizeAgentEval(rows);
  console.log(`\n${s.passedAll}/${s.tasks} tasks passed every check`);
  console.log(Object.entries(s.perCheck).map(([n, v]) => `${n} ${v.passed}/${v.of}`).join('   '));
  console.log(`latency median ${s.medianMs} ms, p90 ${s.p90Ms} ms; mean tool calls ${s.meanToolCalls?.toFixed(1)}`);
  fs.writeFileSync(RESULTS, `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), summary: s, rows }, null, 2)}\n`);

  if (process.argv.includes('--write-baseline')) {
    fs.writeFileSync(BASELINE, `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), tasks: s.tasks, passedAll: s.passedAll, perCheck: s.perCheck }, null, 2)}\n`);
    console.log('Baseline written.');
    return 0;
  }
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  if (base && only.length === 0 && s.passedAll / s.tasks < base.passedAll / base.tasks - TOLERANCE) {
    console.log(`\nREGRESSION: ${s.passedAll}/${s.tasks} passed, baseline ${base.passedAll}/${base.tasks} (tolerance ${TOLERANCE * 100}%)`);
    return 2;
  }
  console.log(base ? '\nNo regression vs baseline.' : '\nNo baseline yet (run with --write-baseline).');
  return 0;
}

main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); process.exit(); });
