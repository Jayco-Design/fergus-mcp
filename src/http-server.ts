#!/usr/bin/env node

/**
 * Fergus MCP Server - HTTP Transport
 * Model Context Protocol server for the Fergus API (HTTP mode)
 */

import { loadHttpConfig } from './config.js';
import { startHttpServer } from './transports/http.js';

/**
 * Main entry point for HTTP server
 */
async function main() {
  // Load configuration
  let config;
  try {
    config = loadHttpConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }

  console.error('Starting Fergus MCP HTTP Server...');
  console.error(`Port: ${config.httpPort}`);
  console.error(`Host: ${config.httpHost}`);
  console.error(`DNS Rebinding Protection: ${config.enableDnsRebindingProtection ? 'enabled' : 'disabled'}`);

  if (config.allowedOrigins?.length) {
    console.error(`Allowed Origins: ${config.allowedOrigins.join(', ')}`);
  }
  if (config.allowedHosts?.length) {
    console.error(`Allowed Hosts: ${config.allowedHosts.join(', ')}`);
  }

  // Start HTTP server
  try {
    await startHttpServer({
      port: config.httpPort,
      host: config.httpHost,
      allowedOrigins: config.allowedOrigins,
      allowedHosts: config.allowedHosts,
      enableDnsRebindingProtection: config.enableDnsRebindingProtection,
      apiToken: config.fergusApiToken,
      fergusBaseUrl: config.fergusBaseUrl,
    });
  } catch (error) {
    console.error('Failed to start HTTP server:', error);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.error('SIGTERM received, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.error('SIGINT received, shutting down gracefully...');
    process.exit(0);
  });
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
