/**
 * Redis-backed token manager for storing and refreshing OAuth tokens
 * Used in production deployments with multiple instances
 */

import { Redis } from 'ioredis';
import { OAuthConfig } from '../config.js';
import { OAuthTokens, refreshAccessToken } from './oauth-handler.js';
import { ITokenManager } from './token-manager-interface.js';

interface StoredTokens {
  tokens: OAuthTokens;
  expiresAt: string; // ISO string for JSON serialization
  createdAt: string; // ISO string for JSON serialization
}

/**
 * Redis-backed token manager class for handling OAuth token storage and refresh
 */
export class RedisTokenManager implements ITokenManager {
  private redis: Redis;
  private config: OAuthConfig;
  private refreshThresholdMs = 5 * 60 * 1000; // Refresh if < 5 minutes remaining
  private keyPrefix = 'fergus-mcp:tokens:';
  private sessionTimeoutMs: number; // TTL for Redis keys (from SESSION_TIMEOUT_MS env var)

  constructor(config: OAuthConfig, redisUrl: string, sessionTimeoutMs?: number) {
    this.config = config;
    this.sessionTimeoutMs = sessionTimeoutMs || 7 * 24 * 60 * 60 * 1000; // Default: 7 days
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.redis.on('error', (error: Error) => {
      console.error('[RedisTokenManager] Redis connection error:', error);
    });

    this.redis.on('connect', () => {
      console.error('[RedisTokenManager] Connected to Redis');
    });
  }

  /**
   * Stores tokens for a session
   * @param sessionId Session identifier
   * @param tokens OAuth tokens
   */
  async storeTokens(sessionId: string, tokens: OAuthTokens): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expiresIn * 1000);

    const stored: StoredTokens = {
      tokens,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    };

    const key = this.getKey(sessionId);
    // Use SESSION_TIMEOUT_MS for Redis TTL (should match refresh token lifetime, not access token)
    // Access tokens expire in 1 hour, but we need to keep refresh tokens for the full session duration
    const ttl = Math.floor(this.sessionTimeoutMs / 1000); // Convert ms to seconds

    await this.redis.setex(key, ttl, JSON.stringify(stored));

    const ttlDays = Math.floor(ttl / 86400);
    console.error(`[RedisTokenManager] Stored tokens for session ${sessionId}, Redis TTL: ${ttl}s (${ttlDays} days), Cognito access token expires at ${expiresAt.toISOString()}`);
  }

  /**
   * Gets a valid access token for a session, refreshing if needed
   * @param sessionId Session identifier
   * @returns Access token or null if session not found
   */
  async getAccessToken(sessionId: string): Promise<string | null> {
    const stored = await this.getStoredTokens(sessionId);

    if (!stored) {
      console.error(`[RedisTokenManager] No tokens found for session ${sessionId}`);
      return null;
    }

    // Check if token is expired or about to expire
    const now = new Date();
    const expiresAt = new Date(stored.expiresAt);
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    if (timeUntilExpiry < this.refreshThresholdMs) {
      console.error(`[RedisTokenManager] Token for session ${sessionId} is expiring soon, attempting refresh`);

      // Try to refresh the token
      try {
        await this.refreshTokenIfNeeded(sessionId);
        const refreshedStored = await this.getStoredTokens(sessionId);
        return refreshedStored?.tokens.accessToken || null;
      } catch (error) {
        console.error(`[RedisTokenManager] Token refresh failed for session ${sessionId}:`, error);
        // Token refresh failed, return null to force re-authentication
        await this.deleteTokens(sessionId);
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
  async getTokens(sessionId: string): Promise<OAuthTokens | null> {
    const stored = await this.getStoredTokens(sessionId);
    return stored?.tokens || null;
  }

  /**
   * Refreshes tokens if they are about to expire
   * @param sessionId Session identifier
   */
  async refreshTokenIfNeeded(sessionId: string): Promise<void> {
    const stored = await this.getStoredTokens(sessionId);

    if (!stored) {
      throw new Error(`No tokens found for session ${sessionId}`);
    }

    const now = new Date();
    const expiresAt = new Date(stored.expiresAt);
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    // Only refresh if about to expire
    if (timeUntilExpiry >= this.refreshThresholdMs) {
      console.error(`[RedisTokenManager] Token for session ${sessionId} is still valid, no refresh needed`);
      return;
    }

    if (!stored.tokens.refreshToken) {
      throw new Error(`No refresh token available for session ${sessionId}`);
    }

    console.error(`[RedisTokenManager] 🔄 Refreshing Cognito tokens for session ${sessionId}`);

    try {
      const newTokens = await refreshAccessToken(this.config, stored.tokens.refreshToken);
      await this.storeTokens(sessionId, newTokens);
      console.error(`[RedisTokenManager] ✅ Successfully refreshed and stored Cognito tokens for session ${sessionId}`);
    } catch (error) {
      console.error(`[RedisTokenManager] ❌ Failed to refresh Cognito token for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Checks if a session has valid tokens
   * @param sessionId Session identifier
   * @returns True if session has tokens
   */
  async hasTokens(sessionId: string): Promise<boolean> {
    const key = this.getKey(sessionId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Gets token expiry time
   * @param sessionId Session identifier
   * @returns Expiry date or null if not found
   */
  async getTokenExpiry(sessionId: string): Promise<Date | null> {
    const stored = await this.getStoredTokens(sessionId);
    return stored ? new Date(stored.expiresAt) : null;
  }

  /**
   * Checks if a token is expired
   * @param sessionId Session identifier
   * @returns True if expired
   */
  async isTokenExpired(sessionId: string): Promise<boolean> {
    const stored = await this.getStoredTokens(sessionId);
    if (!stored) {
      return true;
    }

    return new Date() >= new Date(stored.expiresAt);
  }

  /**
   * Deletes tokens for a session
   * @param sessionId Session identifier
   */
  async deleteTokens(sessionId: string): Promise<void> {
    const key = this.getKey(sessionId);
    await this.redis.del(key);
    console.error(`[RedisTokenManager] Deleted tokens for session ${sessionId}`);
  }

  /**
   * Cleans up expired tokens
   * Not needed for Redis as TTL handles expiration automatically
   */
  cleanupExpiredTokens(): void {
    console.error('[RedisTokenManager] Redis handles TTL expiration automatically');
  }

  /**
   * Gets the number of stored sessions
   * @returns Number of sessions
   */
  async getSessionCount(): Promise<number> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    return keys.length;
  }

  /**
   * Clears all tokens (for testing or shutdown)
   */
  async clearAll(): Promise<void> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      console.error(`[RedisTokenManager] Cleared all ${keys.length} session(s)`);
    }
  }

  /**
   * Closes the Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    console.error('[RedisTokenManager] Redis connection closed');
  }

  /**
   * Private helper to get stored tokens from Redis
   */
  private async getStoredTokens(sessionId: string): Promise<StoredTokens | null> {
    const key = this.getKey(sessionId);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as StoredTokens;
    } catch (error) {
      console.error(`[RedisTokenManager] Failed to parse stored tokens for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Private helper to generate Redis key
   */
  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }
}
