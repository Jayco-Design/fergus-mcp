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

    console.error(`[TokenManager] Stored tokens for session ${sessionId}, expires at ${expiresAt.toISOString()}`);
  }

  /**
   * Gets a valid access token for a session, refreshing if needed
   * @param sessionId Session identifier
   * @returns Access token or null if session not found
   */
  async getAccessToken(sessionId: string): Promise<string | null> {
    const stored = this.storage.get(sessionId);

    if (!stored) {
      console.error(`[TokenManager] No tokens found for session ${sessionId}`);
      return null;
    }

    // Check if token is expired or about to expire
    const now = new Date();
    const timeUntilExpiry = stored.expiresAt.getTime() - now.getTime();

    if (timeUntilExpiry < this.refreshThresholdMs) {
      console.error(`[TokenManager] Token for session ${sessionId} is expiring soon, attempting refresh`);

      // Try to refresh the token
      try {
        await this.refreshTokenIfNeeded(sessionId);
        const refreshedStored = this.storage.get(sessionId);
        return refreshedStored?.tokens.accessToken || null;
      } catch (error) {
        console.error(`[TokenManager] Token refresh failed for session ${sessionId}:`, error);
        // Token refresh failed, return null to force re-authentication
        this.deleteTokens(sessionId);
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
    const stored = this.storage.get(sessionId);
    return stored?.tokens || null;
  }

  /**
   * Refreshes tokens if they are about to expire
   * @param sessionId Session identifier
   */
  async refreshTokenIfNeeded(sessionId: string): Promise<void> {
    const stored = this.storage.get(sessionId);

    if (!stored) {
      throw new Error(`No tokens found for session ${sessionId}`);
    }

    const now = new Date();
    const timeUntilExpiry = stored.expiresAt.getTime() - now.getTime();

    // Only refresh if about to expire
    if (timeUntilExpiry >= this.refreshThresholdMs) {
      console.error(`[TokenManager] Token for session ${sessionId} is still valid, no refresh needed`);
      return;
    }

    if (!stored.tokens.refreshToken) {
      throw new Error(`No refresh token available for session ${sessionId}`);
    }

    console.error(`[TokenManager] Refreshing token for session ${sessionId}`);

    try {
      const newTokens = await refreshAccessToken(this.config, stored.tokens.refreshToken);
      this.storeTokens(sessionId, newTokens);
      console.error(`[TokenManager] Successfully refreshed tokens for session ${sessionId}`);
    } catch (error) {
      console.error(`[TokenManager] Failed to refresh token for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Checks if a session has valid tokens
   * @param sessionId Session identifier
   * @returns True if session has tokens
   */
  hasTokens(sessionId: string): boolean {
    return this.storage.has(sessionId);
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
    console.error(`[TokenManager] Deleted tokens for session ${sessionId}`);
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
