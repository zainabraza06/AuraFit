/**
 * mcpStdio.js — run the stylist MCP server over stdio for local clients (Claude Desktop, IDEs).
 *
 *   npm run mcp:stdio
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   { "mcpServers": { "aurafit": { "command": "node", "args": ["<repo>/backend/scripts/mcpStdio.js"] } } }
 *
 * stdout is the protocol channel: this file must never console.log. Diagnostics go to stderr.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../services/agent/mcpServer.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
console.log = (...a) => console.error(...a); // keep stdout clean for JSON-RPC

await mongoose.connect(process.env.MONGO_URI);
const server = createMcpServer({ userId: process.env.MCP_USER_ID || undefined });
await server.connect(new StdioServerTransport());
console.error('[mcp] aurafit stylist server ready on stdio');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await server.close(); await mongoose.disconnect(); process.exit(0); });
}
