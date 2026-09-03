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
  /** How long an idle MCP transport session is kept before cleanup. */
  timeoutMs: number;
  /**
   * How long stored OAuth tokens (including the Cognito *refresh* token) are kept.
   * Must track the Cognito refresh token lifetime, NOT the 1 hour access token
   * lifetime - the refresh token is what lets us mint new access tokens without
   * sending the user back through the login flow.
   */
  tokenTtlMs: number;
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
  // Idle MCP transport sessions are cheap to rebuild (the client re-initializes with the
  // token it already holds), so this can be short. It is deliberately NOT the token TTL.
  const timeoutMs = parseInt(process.env.SESSION_TIMEOUT_MS || '86400000', 10); // 24 hours
  // Token TTL must outlive the access token by a wide margin. If it matches the access
  // token lifetime, the stored refresh token expires at the same moment the access token
  // does, every refresh finds nothing, and the user is forced back through the OAuth flow
  // roughly once an hour.
  const tokenTtlMs = parseInt(process.env.TOKEN_TTL_MS || '2592000000', 10); // 30 days
  const redisUrl = process.env.REDIS_URL;

  if (storage === 'redis' && !redisUrl) {
    throw new Error('REDIS_URL is required when SESSION_STORAGE=redis');
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`SESSION_TIMEOUT_MS must be a positive number of milliseconds, got: ${process.env.SESSION_TIMEOUT_MS}`);
  }

  if (!Number.isFinite(tokenTtlMs) || tokenTtlMs <= 0) {
    throw new Error(`TOKEN_TTL_MS must be a positive number of milliseconds, got: ${process.env.TOKEN_TTL_MS}`);
  }

  // A token TTL at or near the access token lifetime guarantees forced re-authentication.
  const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
  if (tokenTtlMs <= ACCESS_TOKEN_LIFETIME_MS * 2) {
    console.error(
      `[Config] WARNING: TOKEN_TTL_MS is ${tokenTtlMs}ms, at or near the ` +
      `${ACCESS_TOKEN_LIFETIME_MS}ms access token lifetime. Users will be forced to ` +
      `re-authenticate when their access token expires. Set it to the Cognito refresh ` +
      `token lifetime (e.g. 2592000000 for 30 days).`
    );
  }

  return {
    storage,
    timeoutMs,
    tokenTtlMs,
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
