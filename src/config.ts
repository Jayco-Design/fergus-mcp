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
  fergusApiToken?: string;
  fergusBaseUrl?: string;
}

export interface HttpConfig extends Config {
  httpPort: number;
  httpHost: string;
  publicUrl?: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  enableDnsRebindingProtection?: boolean;
}

export interface OAuthConfig {
  userPoolId: string;
  clientId: string;
  clientSecret: string;
  region: string;
  domain: string;
  redirectUri: string;
  scopes?: string[];
}

export interface SessionConfig {
  timeoutMs: number;
  storage: 'memory' | 'redis' | 'file';
  redisUrl?: string;
}

export interface HttpOAuthConfig extends HttpConfig {
  oauth: OAuthConfig;
  session: SessionConfig;
}

/**
 * Loads and validates configuration from command-line arguments and environment variables
 * Priority: CLI args > Environment variables
 */
export function loadConfig(requireToken: boolean = true): Config {
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

  if (requireToken && !fergusApiToken) {
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

/**
 * Loads HTTP server configuration
 */
export function loadHttpConfig(): HttpConfig {
  const baseConfig = loadConfig();

  return {
    ...baseConfig,
    httpPort: parseInt(process.env.HTTP_PORT || '3100', 10),
    httpHost: process.env.HTTP_HOST || '0.0.0.0',
    publicUrl: process.env.PUBLIC_URL,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(','),
    allowedHosts: process.env.ALLOWED_HOSTS?.split(','),
    enableDnsRebindingProtection: process.env.ENABLE_DNS_REBINDING_PROTECTION !== 'false',
  };
}

/**
 * Loads OAuth configuration from environment variables
 */
export function loadOAuthConfig(): OAuthConfig {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;
  const region = process.env.COGNITO_REGION;
  const domain = process.env.COGNITO_DOMAIN;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;

  if (!userPoolId || !clientId || !clientSecret || !region || !domain || !redirectUri) {
    throw new Error(
      'OAuth configuration is incomplete. Required environment variables: ' +
      'COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, ' +
      'COGNITO_REGION, COGNITO_DOMAIN, OAUTH_REDIRECT_URI'
    );
  }

  return {
    userPoolId,
    clientId,
    clientSecret,
    region,
    domain,
    redirectUri,
    scopes: process.env.OAUTH_SCOPES?.split(' ') || ['openid', 'email', 'profile'],
  };
}

/**
 * Loads session configuration from environment variables
 */
export function loadSessionConfig(): SessionConfig {
  const storage = (process.env.SESSION_STORAGE as 'memory' | 'redis') || 'memory';
  // Default to 7 days (OAuth refresh tokens are valid for 365 days in Cognito)
  // This allows long-lived sessions while still cleaning up truly abandoned sessions
  const timeoutMs = parseInt(process.env.SESSION_TIMEOUT_MS || '604800000', 10); // 7 days
  const redisUrl = process.env.REDIS_URL;

  if (storage === 'redis' && !redisUrl) {
    throw new Error('REDIS_URL is required when SESSION_STORAGE=redis');
  }

  return {
    storage,
    timeoutMs,
    redisUrl,
  };
}

/**
 * Loads HTTP server configuration with OAuth support
 */
export function loadHttpOAuthConfig(): HttpOAuthConfig {
  // Load base config without requiring API token (OAuth will provide tokens)
  const baseConfig = loadConfig(false);
  const oauth = loadOAuthConfig();
  const session = loadSessionConfig();

  return {
    ...baseConfig,
    httpPort: parseInt(process.env.HTTP_PORT || '3100', 10),
    httpHost: process.env.HTTP_HOST || '0.0.0.0',
    publicUrl: process.env.PUBLIC_URL,
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(','),
    allowedHosts: process.env.ALLOWED_HOSTS?.split(','),
    enableDnsRebindingProtection: process.env.ENABLE_DNS_REBINDING_PROTECTION !== 'false',
    oauth,
    session,
  };
}
