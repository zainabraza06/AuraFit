/**
 * stylistController.js — POST /api/stylist/ask : the agentic stylist.
 *
 * The deterministic recommendation workflow (/api/recommendations, /api/outfits) stays the fast path
 * for the product pages. This endpoint is for open-ended requests ("a budget outfit for my cousin's
 * mehndi, I love green") where a few tool calls beat a fixed pipeline. It is quota-limited because
 * every call can use several LLM requests.
 */
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { runStylistAgent } from '../services/agent/graph.js';

const Body = z.object({ message: z.string().trim().min(3).max(500) });

function optionalUserId(req) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ') || !process.env.JWT_SECRET) return undefined;
  try {
    return jwt.verify(h.slice(7), process.env.JWT_SECRET).id;
  } catch {
    return undefined;
  }
}

/** Runs BEFORE the quota check so malformed requests do not use up a caller's daily budget. */
export function validateAsk(req, res, next) {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Send { "message": "what you are looking for" } (3-500 characters)' });
  req.askMessage = parsed.data.message;
  next();
}

export async function askStylist(req, res) {
  try {
    const result = await runStylistAgent({ message: req.askMessage, ctx: { userId: optionalUserId(req) }, llm: req.app.locals.agentLlm });
    res.json({
      answer: result.answer,
      picks: result.picks,
      meta: { stopReason: result.stopReason, steps: result.steps, toolCalls: result.toolCalls, ms: result.ms, requestId: req.id },
    });
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'agent_failed', reqId: req.id, error: e.message }));
    res.status(500).json({ error: 'The stylist is unavailable right now. Please try again.' });
  }
}
