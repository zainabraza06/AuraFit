/**
 * agent/mcpServer.js — exposes the stylist tools over the Model Context Protocol.
 *
 * Any MCP client (Claude Desktop, an IDE, another agent) can then search the catalog and ask for
 * outfit/accessory suggestions without knowing anything about this codebase.
 *
 * Security stance: every tool is read-only (asserted by tests); the HTTP transport requires a bearer
 * token (MCP_TOKEN) and is not mounted at all when that is unset; tools that need a signed-in user
 * (wardrobe) are only registered when the server is created with a userId.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOLS, runTool } from './tools.js';

/**
 * @param {{ userId?: string, name?: string, version?: string }} [opts]
 */
export function createMcpServer({ userId, name = 'aurafit-stylist', version = '1.0.0' } = {}) {
  const server = new McpServer({ name, version });

  for (const tool of TOOLS) {
    if (tool.needsUser && !userId) continue; // never advertise what the caller cannot use
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args) => {
        const result = await runTool(tool.name, args, { userId });
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: Boolean(result?.error) };
      },
    );
  }
  return server;
}
