/**
 * Common interface for token managers
 * Allows swapping between in-memory and Redis implementations
 */

import { OAuthTokens } from './oauth-handler.js';

// Re-export OAuthTokens for convenience
export type { OAuthTokens };

export interface ITokenManager {
  storeTokens(sessionId: string, tokens: OAuthTokens): void | Promise<void>;
  getAccessToken(sessionId: string): Promise<string | null>;
  getTokens(sessionId: string): OAuthTokens | null | Promise<OAuthTokens | null>;
  refreshTokenIfNeeded(sessionId: string): Promise<void>;
  hasTokens(sessionId: string): boolean | Promise<boolean>;
  getTokenExpiry(sessionId: string): Date | null | Promise<Date | null>;
  isTokenExpired(sessionId: string): boolean | Promise<boolean>;
  deleteTokens(sessionId: string): void | Promise<void>;
  cleanupExpiredTokens(): void;
  getSessionCount(): number | Promise<number>;
  clearAll(): void | Promise<void>;
}
