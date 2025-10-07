#!/usr/bin/env node

/**
 * Fergus MCP Server - Stdio Transport
 * Model Context Protocol server for the Fergus API (command-line mode)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { FergusClient } from './fergus-client.js';
import { createMcpServer } from './server.js';

/**
 * Main server setup for stdio transport
 */
async function main() {
  // Load configuration
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }

  // Initialize Fergus API client
  const fergusClient = new FergusClient({
    apiToken: config.fergusApiToken,
    baseUrl: config.fergusBaseUrl,
  });

  // Verify API connection
  const isHealthy = await fergusClient.healthCheck();
  if (!isHealthy) {
    console.error('Failed to connect to Fergus API. Please check your API token and network connection.');
    process.exit(1);
  }

  // Create MCP server with all tools and prompts
  const server = createMcpServer(fergusClient);

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
