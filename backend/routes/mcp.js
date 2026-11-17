/**
 * routes/mcp.js — MCP over Streamable HTTP (stateless: one server + transport per request).
 *
 * Mounted by app.js ONLY when MCP_TOKEN is set. Requests must send `Authorization: Bearer <MCP_TOKEN>`.
 * Anonymous MCP access is never offered: even read-only product search costs CPU (embedding a query).
 */
import crypto from 'node:crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../services/agent/mcpServer.js';

export function tokenMatches(header, expected) {
  if (!expected || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createMcpRouter({ token = process.env.MCP_TOKEN } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!tokenMatches(req.headers.authorization, token)) {
      res.set('WWW-Authenticate', 'Bearer realm="aurafit-mcp"');
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
    }
    next();
  });

  router.post('/', express.json({ limit: '256kb' }), async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  });

  // Stateless server: no server-initiated streams and no sessions to delete.
  const notAllowed = (req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  router.get('/', notAllowed);
  router.delete('/', notAllowed);
  return router;
}
