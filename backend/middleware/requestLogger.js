/**
 * requestLogger.js — one structured JSON line per request, with a request id.
 *
 * - Reuses an incoming X-Request-Id (if it looks sane) so a trace can span proxy -> API -> pipeline,
 *   otherwise generates one. The id is echoed in the response header and exposed as req.id.
 * - Logs method, route PATTERN (not raw URL, so no ids/tokens/query strings leak into logs),
 *   status, duration, bytes, and the caller (user id or ip).
 * - Health checks and /metrics are skipped; they would drown real traffic.
 */
import { randomUUID } from 'node:crypto';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;
const SKIP = new Set(['/api/health', '/metrics']);

export function resolveRequestId(header) {
  return typeof header === 'string' && SAFE_ID.test(header) ? header : randomUUID();
}

function routeLabel(req) {
  // After routing, req.route.path is the pattern; baseUrl is the mounted prefix.
  if (req.route?.path) return `${req.baseUrl || ''}${req.route.path}`;
  return req.baseUrl ? `${req.baseUrl}/*` : 'unmatched';
}

/** @param {{ write?: (line: string) => void, now?: () => number }} [opts] */
export function requestLogger({ write = (line) => process.stdout.write(`${line}\n`), now = () => Number(process.hrtime.bigint() / 1000n) / 1000 } = {}) {
  return function requestLoggerMiddleware(req, res, next) {
    req.id = resolveRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', req.id);
    if (SKIP.has(req.path)) return next();

    const start = now();
    res.on('finish', () => {
      const entry = {
        ts: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        msg: 'request',
        reqId: req.id,
        method: req.method,
        route: routeLabel(req),
        status: res.statusCode,
        ms: Math.round((now() - start) * 10) / 10,
        bytes: Number(res.getHeader('content-length')) || undefined,
        user: req.user?._id ? String(req.user._id) : undefined,
        ip: req.ip,
      };
      try { write(JSON.stringify(entry)); } catch { /* logging must never break a request */ }
    });
    next();
  };
}
