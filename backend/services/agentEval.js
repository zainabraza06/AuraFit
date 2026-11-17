/**
 * agentEval.js — programmatic judges for the stylist agent. No LLM is used to grade an LLM: every check is a
 * fact that can be read off the answer and the catalog.
 *
 * A task is a request plus a set of checks. Checks that are not listed for a task are not applied.
 *   maxTotal      sum of the prices of all picks <= N          (a budget "in total")
 *   maxEach       every pick's price <= N                      ("under N" for each piece)
 *   colorAny      at least one CLOTHING/ACCESSORY pick's colour contains one of these words
 *   catalogsAll   picks include at least one product from each of these catalogs
 *   forbidIds     none of these ids may appear in the picks
 *   allowNoPicks  an honest empty answer is acceptable (otherwise zero picks fails the task)
 * Always checked: the run ended with an answer (not a budget cut-off or LLM failure fallback), every pick came
 * from a tool result (grounding), every pick is in stock in the database, and picks are not duplicates.
 */

const norm = (s) => String(s ?? '').toLowerCase();

/** @returns {{ name: string, ok: boolean, detail?: string }[]} */
export function judgeAgentRun(task, run, { stockById = new Map() } = {}) {
  const c = task.checks || {};
  const picks = run.picks || [];
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) });

  add('answered', run.stopReason === 'answered', run.stopReason !== 'answered' ? `stopReason=${run.stopReason}` : undefined);
  add('grounded', (run.droppedUngroundedPicks || 0) === 0, run.droppedUngroundedPicks ? `${run.droppedUngroundedPicks} invented id(s) were dropped` : undefined);
  add('in_stock', picks.every((p) => stockById.get(String(p.id)) !== false), 'a pick is sold out');
  add('no_duplicates', new Set(picks.map((p) => p.id)).size === picks.length);
  add('has_picks', picks.length > 0 || c.allowNoPicks === true, 'no products were recommended');

  if (c.maxTotal != null) {
    const total = picks.reduce((s, p) => s + (Number(p.price) || 0), 0);
    add('budget_total', total <= c.maxTotal, `total ${total} > ${c.maxTotal}`);
  }
  if (c.maxEach != null) {
    const over = picks.filter((p) => Number(p.price) > c.maxEach);
    add('budget_each', over.length === 0, over.length ? `${over.map((p) => p.price).join(', ')} > ${c.maxEach}` : undefined);
  }
  if (c.colorAny) {
    const hit = picks.some((p) => c.colorAny.some((w) => norm(p.color).includes(w) || norm(p.name).includes(w)));
    add('color', hit || (picks.length === 0 && c.allowNoPicks), `none of [${c.colorAny.join(', ')}] in ${picks.map((p) => p.color).join(', ') || 'no picks'}`);
  }
  if (c.catalogsAll) {
    const have = new Set(picks.map((p) => p.catalog));
    const missing = c.catalogsAll.filter((k) => !have.has(k));
    add('catalogs', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : undefined);
  }
  if (c.forbidIds) {
    add('forbidden_ids', !picks.some((p) => c.forbidIds.includes(String(p.id))), 'a forbidden id was recommended');
  }
  return out;
}

/** A task passes when every applied check passes. */
export const taskPassed = (checks) => checks.every((c) => c.ok);

export function summarizeAgentEval(rows) {
  const names = [...new Set(rows.flatMap((r) => r.checks.map((c) => c.name)))];
  const perCheck = Object.fromEntries(names.map((n) => {
    const applicable = rows.filter((r) => r.checks.some((c) => c.name === n));
    return [n, { passed: applicable.filter((r) => r.checks.find((c) => c.name === n).ok).length, of: applicable.length }];
  }));
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  return {
    tasks: rows.length,
    passedAll: rows.filter((r) => taskPassed(r.checks)).length,
    perCheck,
    medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    p90Ms: ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.9))] : null,
    meanToolCalls: rows.length ? rows.reduce((s, r) => s + (r.toolCalls || 0), 0) / rows.length : null,
  };
}
