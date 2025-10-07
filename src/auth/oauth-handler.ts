/**
 * OAuth 2.0 handler for AWS Cognito authentication
 * Implements authorization code flow with PKCE support
 */

import { OAuthConfig } from '../config.js';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn: number; // seconds
  tokenType: string; // "Bearer"
}

export interface OAuthError {
  error: string;
  error_description?: string;
}

/**
 * Generates the OAuth authorization URL for Cognito
 * @param config OAuth configuration
 * @param state Random state parameter for CSRF protection
 * @param codeChallenge Optional PKCE code challenge
 * @returns Authorization URL
 */
export function generateAuthUrl(
  config: OAuthConfig,
  state: string,
  codeChallenge?: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: config.scopes?.join(' ') || 'openid email profile',
  });

  // Add PKCE if provided
  if (codeChallenge) {
    params.append('code_challenge', codeChallenge);
    params.append('code_challenge_method', 'S256');
  }

  return `https://${config.domain}/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchanges authorization code for tokens
 * @param config OAuth configuration
 * @param code Authorization code from callback
 * @param codeVerifier Optional PKCE code verifier
 * @returns OAuth tokens
 */
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  codeVerifier?: string
): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
  });

  // Add PKCE code verifier if provided
  if (codeVerifier) {
    params.append('code_verifier', codeVerifier);
  }

  // Encode client credentials for Basic Auth
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await fetch(`https://${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json() as OAuthError;
    throw new Error(
      `Token exchange failed: ${error.error}${error.error_description ? ` - ${error.error_description}` : ''}`
    );
  }

  const data = await response.json() as any;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  };
}

/**
 * Refreshes an expired access token using a refresh token
 * @param config OAuth configuration
 * @param refreshToken Refresh token
 * @returns New OAuth tokens
 */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string
): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  });

  // Encode client credentials for Basic Auth
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await fetch(`https://${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json() as OAuthError;
    throw new Error(
      `Token refresh failed: ${error.error}${error.error_description ? ` - ${error.error_description}` : ''}`
    );
  }

  const data = await response.json() as any;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Use existing if not provided
    idToken: data.id_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  };
}

/**
 * Revokes a token (access or refresh token)
 * @param config OAuth configuration
 * @param token Token to revoke
 */
export async function revokeToken(
  config: OAuthConfig,
  token: string
): Promise<void> {
  const params = new URLSearchParams({
    token,
    client_id: config.clientId,
  });

  // Encode client credentials for Basic Auth
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await fetch(`https://${config.domain}/oauth2/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json() as OAuthError;
    throw new Error(
      `Token revocation failed: ${error.error}${error.error_description ? ` - ${error.error_description}` : ''}`
    );
  }
}

/**
 * Generates a random state parameter for OAuth flow
 * @returns Random state string (base64url encoded)
 */
export function generateState(): string {
  const buffer = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(buffer).toString('base64url');
}

/**
 * Generates PKCE code verifier and challenge
 * @returns Object with code verifier and code challenge
 */
export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  // Generate code verifier (43-128 characters, base64url)
  const verifierBuffer = crypto.getRandomValues(new Uint8Array(32));
  const verifier = Buffer.from(verifierBuffer).toString('base64url');

  // Generate code challenge (SHA256 hash of verifier, base64url encoded)
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const challenge = Buffer.from(hashBuffer).toString('base64url');

  return { verifier, challenge };
}
