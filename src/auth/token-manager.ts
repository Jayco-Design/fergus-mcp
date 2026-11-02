/**
 * Token manager for storing and refreshing OAuth tokens
 * Supports in-memory storage with automatic token refresh
 */

import { OAuthConfig } from '../config.js';
import { OAuthTokens, refreshAccessToken } from './oauth-handler.js';
import { ITokenManager } from './token-manager-interface.js';

interface StoredTokens {
  tokens: OAuthTokens;
  expiresAt: Date;
  createdAt: Date;
  /** Set when the session was rotated out; the tokens stop working after this time. */
  retiredUntil?: Date;
}

/**
 * Token manager class for handling OAuth token storage and refresh
 */
export class TokenManager implements ITokenManager {
  private storage = new Map<string, StoredTokens>();
  private config: OAuthConfig;
  private refreshThresholdMs = 5 * 60 * 1000; // Refresh if < 5 minutes remaining

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Stores tokens for a session
   * @param sessionId Session identifier
   * @param tokens OAuth tokens
   */
  storeTokens(sessionId: string, tokens: OAuthTokens): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expiresIn * 1000);

    this.storage.set(sessionId, {
      tokens,
      expiresAt,
      createdAt: now,
    });

    console.error(`[TokenManager] Stored tokens for session, expires at ${expiresAt.toISOString()}`);
  }

  /**
   * Gets a valid access token for a session, refreshing if needed
   * @param sessionId Session identifier
   * @returns Access token or null if session not found
   */
  async getAccessToken(sessionId: string): Promise<string | null> {
    const stored = this.getLive(sessionId);

    if (!stored) {
      return null;
    }

    // Check if token is expired or about to expire
    const now = new Date();
    const timeUntilExpiry = stored.expiresAt.getTime() - now.getTime();

    // A retired session is never refreshed: it only serves requests already in flight
    if (stored.retiredUntil) {
      return timeUntilExpiry > 0 ? stored.tokens.accessToken : null;
    }

    if (timeUntilExpiry < this.refreshThresholdMs) {
      console.error('[TokenManager] Token for session is expiring soon, attempting refresh');

      // Try to refresh the token. Use the refreshed token directly: if the session was
      // retired while Cognito answered, it isn't written back but is still valid for this call.
      try {
        const refreshed = await this.refreshAndStore(sessionId, stored);
        return refreshed.accessToken;
      } catch (error) {
        console.error('[TokenManager] Token refresh failed for session');
        // Token refresh failed, return null to force re-authentication. A session retired
        // meanwhile is left to its grace period: requests already in flight can still use it.
        if (!this.storage.get(sessionId)?.retiredUntil) {
          this.deleteTokens(sessionId);
        }
        return null;
      }
    }

    return stored.tokens.accessToken;
  }

  /**
   * Gets all tokens for a session (including refresh token)
   * @param sessionId Session identifier
   * @returns OAuth tokens or null if not found
   */
  getTokens(sessionId: string): OAuthTokens | null {
    const stored = this.getLive(sessionId);
    if (!stored) {
      return null;
    }
    // expiresIn is what's left of the access token's lifetime, so tokens copied to a new
    // session keep their real expiry
    const expiresIn = Math.max(0, Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000));
    return { ...stored.tokens, expiresIn };
  }

  /**
   * Refreshes tokens if they are about to expire
   * @param sessionId Session identifier
   */
  async refreshTokenIfNeeded(sessionId: string): Promise<void> {
    const stored = this.storage.get(sessionId);

    if (!stored) {
      throw new Error('No tokens found for session');
    }

    const now = new Date();
    const timeUntilExpiry = stored.expiresAt.getTime() - now.getTime();

    // Only refresh if about to expire, and never a retired session
    if (timeUntilExpiry >= this.refreshThresholdMs || stored.retiredUntil) {
      console.error('[TokenManager] Token for session is still valid, no refresh needed');
      return;
    }

    await this.refreshAndStore(sessionId, stored);
  }

  /**
   * Refreshes the Cognito tokens and stores them, unless the session has been retired or
   * removed meanwhile. Returns the refreshed tokens either way.
   */
  private async refreshAndStore(sessionId: string, stored: StoredTokens): Promise<OAuthTokens> {
    if (!stored.tokens.refreshToken) {
      throw new Error('No refresh token available for session');
    }

    console.error('[TokenManager] Refreshing token for session');

    try {
      const newTokens = await refreshAccessToken(this.config, stored.tokens.refreshToken);
      const current = this.storage.get(sessionId);
      if (current && !current.retiredUntil) {
        this.storeTokens(sessionId, newTokens);
        console.error('[TokenManager] Successfully refreshed tokens for session');
      }
      return newTokens;
    } catch (error) {
      console.error('[TokenManager] Failed to refresh token for session');
      throw error;
    }
  }

  /**
   * Checks if a session has valid tokens
   * @param sessionId Session identifier
   * @returns True if session has tokens
   */
  hasTokens(sessionId: string): boolean {
    return this.getLive(sessionId) !== undefined;
  }

  /**
   * Gets token expiry time
   * @param sessionId Session identifier
   * @returns Expiry date or null if not found
   */
  getTokenExpiry(sessionId: string): Date | null {
    const stored = this.storage.get(sessionId);
    return stored?.expiresAt || null;
  }

  /**
   * Checks if a token is expired
   * @param sessionId Session identifier
   * @returns True if expired
   */
  isTokenExpired(sessionId: string): boolean {
    const stored = this.storage.get(sessionId);
    if (!stored) {
      return true;
    }

    return new Date() >= stored.expiresAt;
  }

  /**
   * Deletes tokens for a session
   * @param sessionId Session identifier
   */
  deleteTokens(sessionId: string): void {
    this.storage.delete(sessionId);
    console.error('[TokenManager] Deleted tokens for session');
  }

  retireTokens(sessionId: string, graceMs: number): boolean {
    const stored = this.getLive(sessionId);
    if (!stored || stored.retiredUntil) {
      return false;
    }
    stored.retiredUntil = new Date(Date.now() + graceMs);
    // Drop the entry when the grace period ends, even if nothing reads it again. Timers can
    // fire a moment before Date.now() reaches the deadline, so don't re-check it here.
    setTimeout(() => {
      if (this.storage.get(sessionId) === stored) {
        this.storage.delete(sessionId);
      }
    }, graceMs).unref();
    return true;
  }

  isRetired(sessionId: string): boolean {
    return this.storage.get(sessionId)?.retiredUntil !== undefined;
  }

  /** Returns stored tokens unless they were retired and their grace period has passed. */
  private getLive(sessionId: string): StoredTokens | undefined {
    const stored = this.storage.get(sessionId);
    if (stored?.retiredUntil && Date.now() >= stored.retiredUntil.getTime()) {
      this.storage.delete(sessionId);
      return undefined;
    }
    return stored;
  }

  /**
   * Cleans up expired tokens
   * Should be called periodically
   */
  cleanupExpiredTokens(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, stored] of this.storage.entries()) {
      if (now >= stored.expiresAt) {
        this.storage.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.error(`[TokenManager] Cleaned up ${cleaned} expired token(s)`);
    }
  }

  /**
   * Gets the number of stored sessions
   * @returns Number of sessions
   */
  getSessionCount(): number {
    return this.storage.size;
  }

  /**
   * Clears all tokens (for testing or shutdown)
   */
  clearAll(): void {
    const count = this.storage.size;
    this.storage.clear();
    console.error(`[TokenManager] Cleared all ${count} session(s)`);
  }
}
