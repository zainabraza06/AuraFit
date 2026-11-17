/**
 * agent/graph.js — the stylist agent as a LangGraph state machine.
 *
 *        START -> decide --(tool)--> act --> decide ...
 *                   |
 *                   +--(final | budget exhausted)--> END
 *
 * Why a graph and not a free-running loop: every transition is explicit, the budget is enforced in
 * ONE place (decide), and a run can never exceed maxSteps / maxToolCalls / wall-clock.
 *
 * Safety properties (all unit-tested):
 *  - Tools are read-only (tools.js); the agent cannot spend money or change data.
 *  - Tool results are wrapped as untrusted data before the model sees them (promptSafety.js), so
 *    scraped text cannot issue instructions.
 *  - GROUNDING: the final answer may only recommend product ids that a tool actually returned in this
 *    run. Invented ids are dropped, so the agent cannot hallucinate products.
 *  - Graceful degradation: if the LLM is unavailable or keeps returning invalid output, the run ends
 *    with a deterministic answer built from the best search results instead of an error.
 */
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { z } from 'zod';
import { TOOLS, TOOL_BY_NAME, runTool } from './tools.js';
import { completeJsonWithProviderFallback } from '../llmClient.js';
import { untrusted, UNTRUSTED_NOTICE } from '../../utils/promptSafety.js';
import { findViolations, violationFeedback } from './constraints.js';
import { agentRuns, agentSteps } from '../../observability/metrics.js';

export const DEFAULT_BUDGET = { maxSteps: 7, maxToolCalls: 5, maxMs: 60_000, maxObservationChars: 5000, maxRevisions: 1 };

const ToolCall = z.object({ action: z.literal('tool'), tool: z.string(), args: z.record(z.string(), z.any()).default({}), thought: z.string().max(300).optional() });
const Final = z.object({
  action: z.literal('final'),
  answer: z.string().min(1).max(1500),
  picks: z.array(z.object({ id: z.string(), why: z.string().max(300).default('') })).max(8).default([]),
});
export const Decision = z.discriminatedUnion('action', [ToolCall, Final]);

function toolCatalogText(tools) {
  return tools
    .map((t) => {
      const schema = z.toJSONSchema(t.input);
      const props = Object.entries(schema.properties || {}).map(([k, v]) => `${k}${(schema.required || []).includes(k) ? '' : '?'}: ${v.enum ? v.enum.join('|') : v.type}`);
      return `- ${t.name}(${props.join(', ')}): ${t.description}`;
    })
    .join('\n');
}

export function buildSystemPrompt(tools, budget) {
  return [
    "You are AuraFit's personal stylist for Pakistani fashion (clothing, shoes, jewelry, watches). You help a shopper put together outfits from the live catalog.",
    'You work in steps. At each step reply with ONE JSON object and nothing else:',
    '  {"action":"tool","tool":"<name>","args":{...},"thought":"why"}   to call a tool, or',
    '  {"action":"final","answer":"<friendly advice, 2-5 sentences>","picks":[{"id":"<product id from a tool result>","why":"<short reason>"}]}   when you can answer.',
    '',
    'Tools (all read-only):',
    toolCatalogText(tools),
    '',
    'Rules:',
    `- You have at most ${budget.maxToolCalls} tool calls. Be efficient: search first, then get_product / suggest_accessories only if it helps.`,
    '- Only recommend products that appeared in tool results, using their exact "id". Never invent products, prices or ids.',
    '- Respect the shopper\'s budget, occasion, colours and gender. If nothing fits, say so honestly and suggest the closest alternative.',
    `- ${UNTRUSTED_NOTICE}`,
  ].join('\n');
}

const State = Annotation.Root({
  message: Annotation(),
  history: Annotation({ reducer: (a, b) => a.concat(b), default: () => [] }), // { role: 'tool', tool, args, observation }
  decision: Annotation(),
  steps: Annotation({ reducer: (_a, b) => b, default: () => 0 }),
  toolCalls: Annotation({ reducer: (_a, b) => b, default: () => 0 }),
  final: Annotation(),
  stopReason: Annotation(),
  feedback: Annotation({ reducer: (_a, b) => b, default: () => '' }), // why the previous answer was sent back
  revisions: Annotation({ reducer: (_a, b) => b, default: () => 0 }),
  unresolved: Annotation({ reducer: (_a, b) => b, default: () => [] }),
});

function renderHistory(history, maxChars) {
  if (!history.length) return '(no tool calls yet)';
  return history
    .map((h, i) => `Step ${i + 1}: called ${h.tool} with ${JSON.stringify(h.args)}\nResult: ${untrusted(JSON.stringify(h.observation), maxChars)}`)
    .join('\n\n');
}

/** Every product id a tool returned during this run (for the grounding check). */
export function collectProducts(history) {
  const byId = new Map();
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      if (typeof v.id === 'string' && /^[a-f0-9]{24}$/i.test(v.id) && v.name) byId.set(v.id, v);
      Object.values(v).forEach(visit);
    }
  };
  history.forEach((h) => visit(h.observation));
  return byId;
}

/** Deterministic answer when the LLM cannot be used: the best search hits, honestly labelled. */
export function fallbackAnswer(history, message) {
  const products = [...collectProducts(history).values()].slice(0, 4);
  if (!products.length) {
    return { answer: "I couldn't reach my styling assistant just now and found nothing yet for that request. Try rephrasing it, e.g. mention a colour, occasion and budget.", picks: [] };
  }
  return {
    answer: `Here are the closest matches I found for "${String(message).slice(0, 80)}". (My styling assistant is unavailable right now, so these are straight search results.)`,
    picks: products.map((p) => ({ id: p.id, why: [p.brand, p.color, p.type].filter(Boolean).join(' · ') })),
  };
}

/**
 * @param {{ message: string, ctx?: { userId?: string }, budget?: Partial<typeof DEFAULT_BUDGET>,
 *           llm?: (args: { system: string, user: string }) => Promise<unknown>, tools?: typeof TOOLS,
 *           exec?: typeof runTool, now?: () => number }} opts
 */
export async function runStylistAgent({ message, ctx = {}, budget: b = {}, llm, tools = TOOLS, exec = runTool, now = Date.now }) {
  const budget = { ...DEFAULT_BUDGET, ...b };
  const available = tools.filter((t) => !t.needsUser || ctx.userId);
  const system = buildSystemPrompt(available, budget);
  const started = now();

  const callLlm =
    llm ||
    (async ({ system: s, user }) => {
      const r = await completeJsonWithProviderFallback({ system: s, user, temperature: 0.2, feature: 'agent', validate: (o) => Decision.parse(o) });
      return r.value;
    });

  async function decide(state) {
    const outOfBudget = state.steps >= budget.maxSteps || state.toolCalls >= budget.maxToolCalls || now() - started > budget.maxMs;
    const user = [
      `Shopper request: ${untrusted(state.message, 600)}`,
      '',
      renderHistory(state.history, budget.maxObservationChars),
      '',
      state.feedback ? `
${state.feedback}
` : '',
      outOfBudget ? 'Your tool budget is used up. Reply now with a "final" action using what you have.' : 'What is your next action?',
    ].join('\n');
    let decision;
    try {
      decision = Decision.parse(await callLlm({ system, user }));
    } catch (e) {
      return { steps: state.steps + 1, final: fallbackAnswer(state.history, state.message), stopReason: `llm_failed: ${String(e.message).slice(0, 80)}`, decision: { action: 'final' } };
    }
    if (outOfBudget && decision.action === 'tool') {
      return { steps: state.steps + 1, final: fallbackAnswer(state.history, state.message), stopReason: 'budget', decision: { action: 'final' } };
    }
    if (decision.action === 'final') return { steps: state.steps + 1, decision, stopReason: 'answered' };
    return { steps: state.steps + 1, decision };
  }

  async function act(state) {
    const { tool, args } = state.decision;
    const known = available.find((t) => t.name === tool);
    const observation = known ? await exec(tool, args, ctx) : { error: 'unknown_tool', available: available.map((t) => t.name) };
    return { history: [{ tool, args, observation }], toolCalls: state.toolCalls + 1 };
  }

  /**
   * Verify: the model's answer is checked against requirements stated in the request that can be checked with
   * certainty (a budget in PKR, catalogs that were named). On a violation the model gets ONE chance to fix it, with the
   * exact problem spelled out; the eval showed it otherwise overshoots budgets and forgets categories.
   * No revision is attempted when the budget for steps/tools/time is already spent (it could not search again).
   */
  async function verify(state) {
    const known = collectProducts(state.history || []);
    const picks = (state.decision?.picks || []).filter((p) => known.has(p.id)).map((p) => known.get(p.id));
    const violations = findViolations(state.message, picks);
    const canRevise = state.revisions < budget.maxRevisions && state.steps < budget.maxSteps - 1 && state.toolCalls < budget.maxToolCalls && now() - started < budget.maxMs;
    if (violations.length && canRevise) {
      return { feedback: violationFeedback(violations), revisions: state.revisions + 1, decision: { action: 'revise' } };
    }
    return { unresolved: violations.map((v) => v.type) };
  }

  const afterDecide = (state) => {
    if (state.final) return END; // fallback answer: nothing to verify
    if (state.decision?.action === 'tool') return 'act';
    return 'verify';
  };
  const afterVerify = (state) => (state.decision?.action === 'revise' ? 'decide' : END);

  const graph = new StateGraph(State)
    .addNode('decide', decide)
    .addNode('act', act)
    .addNode('verify', verify)
    .addEdge(START, 'decide')
    .addConditionalEdges('decide', afterDecide, { act: 'act', verify: 'verify', [END]: END })
    .addEdge('act', 'decide')
    .addConditionalEdges('verify', afterVerify, { decide: 'decide', [END]: END })
    .compile();

  const out = await graph.invoke({ message }, { recursionLimit: budget.maxSteps * 3 + 8 });

  // Grounding: keep only picks whose id a tool actually returned.
  const known = collectProducts(out.history || []);
  const rawFinal = out.final || out.decision;
  const picks = (rawFinal.picks || []).filter((p) => known.has(p.id)).map((p) => ({ ...known.get(p.id), why: p.why }));
  const dropped = (rawFinal.picks || []).length - picks.length;

  const result = {
    answer: rawFinal.answer,
    picks,
    stopReason: out.stopReason || 'answered',
    steps: out.steps,
    toolCalls: out.toolCalls,
    droppedUngroundedPicks: dropped,
    revisions: out.revisions || 0,
    unresolvedViolations: out.unresolved || [],
    trace: (out.history || []).map((h) => ({ tool: h.tool, args: h.args, ok: !h.observation?.error })),
    ms: now() - started,
  };
  agentRuns.inc({ outcome: result.stopReason.startsWith('llm_failed') ? 'llm_failed' : result.stopReason });
  agentSteps.observe(result.steps);
  return result;
}

export { TOOL_BY_NAME };
