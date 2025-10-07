/**
 * Configuration management for Fergus MCP Server
 */

import * as dotenv from 'dotenv';

// Load environment variables (only if .env exists, silently)
// Suppress all output to avoid breaking MCP stdio protocol
const originalLog = console.log;
console.log = () => {};
dotenv.config({ debug: false });
console.log = originalLog;

export interface Config {
  fergusApiToken: string;
  fergusBaseUrl?: string;
}

/**
 * Loads and validates configuration from command-line arguments and environment variables
 * Priority: CLI args > Environment variables
 */
export function loadConfig(): Config {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  let apiTokenFromArgs: string | undefined;
  let baseUrlFromArgs: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--api-token' && i + 1 < args.length) {
      apiTokenFromArgs = args[i + 1];
      i++;
    } else if (args[i] === '--base-url' && i + 1 < args.length) {
      baseUrlFromArgs = args[i + 1];
      i++;
    }
  }

  // Get API token from CLI args or environment
  const fergusApiToken = apiTokenFromArgs || process.env.FERGUS_API_TOKEN;

  if (!fergusApiToken) {
    throw new Error(
      'Fergus API token is required. ' +
      'Provide it via --api-token argument or FERGUS_API_TOKEN environment variable.'
    );
  }

  return {
    fergusApiToken,
    fergusBaseUrl: baseUrlFromArgs || process.env.FERGUS_BASE_URL,
  };
}
