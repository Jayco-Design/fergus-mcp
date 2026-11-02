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
  /**
   * Retires a session's tokens after refresh-token rotation. For graceMs they still work as
   * a bearer token (requests already in flight when the client rotated), but they are never
   * refreshed and isRetired() reports true so they can't be redeemed again. After graceMs
   * they are gone. A Cognito refresh that finishes after retirement must not revive them.
   * Returns true only for the one call that retired the session; false if it was already
   * retired or doesn't exist, so concurrent refresh grants can't both redeem it.
   */
  retireTokens(sessionId: string, graceMs: number): boolean | Promise<boolean>;
  isRetired(sessionId: string): boolean | Promise<boolean>;
  cleanupExpiredTokens(): void;
  getSessionCount(): number | Promise<number>;
  clearAll(): void | Promise<void>;
}
