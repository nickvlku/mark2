import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server';

/**
 * Entry point for the Mark2 MCP server.
 *
 * Run with: node dist/lib/mcp/index.js
 *
 * The server communicates over stdio using the Model Context Protocol,
 * exposing tools that allow AI coding agents to interact with the
 * Mark2 orchestration system.
 */
async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
