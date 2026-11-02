/**
 * Redis-backed token manager for storing and refreshing OAuth tokens
 * Used in production deployments with multiple instances
 */

import { Redis } from 'ioredis';
import { OAuthConfig } from '../config.js';
import { OAuthTokens, refreshAccessToken } from './oauth-handler.js';
import { ITokenManager } from './token-manager-interface.js';

/** Extra life for a retired marker beyond any token key it guards, to absorb clock and latency skew. */
const RETIRED_MARKER_MARGIN_MS = 60 * 1000;

interface StoredTokens {
  tokens: OAuthTokens;
  expiresAt: string; // ISO string for JSON serialization
  createdAt: string; // ISO string for JSON serialization
}

/**
 * Redis-backed token manager class for handling OAuth token storage and refresh
 *
 * A session rotated out by a refresh grant is marked with a separate retired key, set with
 * SET NX so only one refresh grant can claim it. Both the retirement and a Cognito refresh
 * that finishes afterwards re-check that key and cut the token key's TTL to the grace
 * period, so a late refresh can't bring a retired session back to life.
 */
export class RedisTokenManager implements ITokenManager {
  private redis: Redis;
  private config: OAuthConfig;
  private refreshThresholdMs = 5 * 60 * 1000; // Refresh if < 5 minutes remaining
  private keyPrefix = 'fergus-mcp:tokens:';
  private retiredKeyPrefix = 'fergus-mcp:retired:';
  private tokenTtlMs: number; // TTL for Redis keys (from TOKEN_TTL_MS env var)

  /**
   * @param client Optional pre-built client (used by tests); otherwise one is created from redisUrl
   */
  constructor(config: OAuthConfig, redisUrl: string, tokenTtlMs?: number, client?: Redis) {
    this.config = config;
    this.tokenTtlMs = tokenTtlMs || 30 * 24 * 60 * 60 * 1000; // Default: 30 days
    this.redis = client ?? new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.redis.on('error', (error: Error) => {
      console.error('[RedisTokenManager] Redis connection error');
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
    // TTL tracks the Cognito *refresh* token lifetime, not the 1 hour access token
    // lifetime. If the key expired alongside the access token, the refresh that is due
    // at that same moment would find nothing and the user would be sent back through
    // the OAuth flow.
    const ttl = Math.floor(this.tokenTtlMs / 1000); // Convert ms to seconds

    await this.redis.setex(key, ttl, JSON.stringify(stored));

    const ttlDays = Math.floor(ttl / 86400);
    console.error(`[RedisTokenManager] Stored tokens for session, Redis TTL: ${ttl}s (${ttlDays} days), Cognito access token expires at ${expiresAt.toISOString()}`);
  }

  /**
   * Gets a valid access token for a session, refreshing if needed
   * @param sessionId Session identifier
   * @returns Access token or null if session not found
   */
  async getAccessToken(sessionId: string): Promise<string | null> {
    const entry = await this.getEntry(sessionId);

    if (!entry) {
      return null;
    }
    const { stored, retired } = entry;

    // Check if token is expired or about to expire
    const now = new Date();
    const expiresAt = new Date(stored.expiresAt);
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    // A retired session is never refreshed: it only serves requests already in flight
    if (retired) {
      return timeUntilExpiry > 0 ? stored.tokens.accessToken : null;
    }

    if (timeUntilExpiry < this.refreshThresholdMs) {
      console.error('[RedisTokenManager] Token for session is expiring soon, attempting refresh');

      // Try to refresh the token. Use the refreshed token directly: if the session was
      // retired while Cognito answered, it isn't written back but is still valid for this call.
      try {
        const refreshed = await this.refreshAndStore(sessionId, stored);
        return refreshed.accessToken;
      } catch (error) {
        console.error('[RedisTokenManager] Token refresh failed for session');
        // Token refresh failed, return null to force re-authentication. A session retired
        // meanwhile is left to its grace period: requests already in flight can still use it.
        if (!(await this.isRetired(sessionId))) {
          await this.deleteTokens(sessionId);
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
  async getTokens(sessionId: string): Promise<OAuthTokens | null> {
    const entry = await this.getEntry(sessionId);
    if (!entry) {
      return null;
    }
    // expiresIn is what's left of the access token's lifetime, so tokens copied to a new
    // session keep their real expiry
    const expiresIn = Math.max(0, Math.floor((new Date(entry.stored.expiresAt).getTime() - Date.now()) / 1000));
    return { ...entry.stored.tokens, expiresIn };
  }

  /**
   * Refreshes tokens if they are about to expire
   * @param sessionId Session identifier
   */
  async refreshTokenIfNeeded(sessionId: string): Promise<void> {
    const entry = await this.getEntry(sessionId);

    if (!entry) {
      throw new Error('No tokens found for session');
    }

    const now = new Date();
    const expiresAt = new Date(entry.stored.expiresAt);
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();

    // Only refresh if about to expire, and never a retired session
    if (timeUntilExpiry >= this.refreshThresholdMs || entry.retired) {
      console.error('[RedisTokenManager] Token for session is still valid, no refresh needed');
      return;
    }

    await this.refreshAndStore(sessionId, entry.stored);
  }

  /**
   * Refreshes the Cognito tokens and stores them, unless the session has been retired
   * meanwhile. Returns the refreshed tokens either way.
   */
  private async refreshAndStore(sessionId: string, stored: StoredTokens): Promise<OAuthTokens> {
    if (!stored.tokens.refreshToken) {
      throw new Error('No refresh token available for session');
    }

    console.error('[RedisTokenManager] 🔄 Refreshing Cognito tokens for session');

    try {
      const newTokens = await refreshAccessToken(this.config, stored.tokens.refreshToken);
      if (await this.isRetired(sessionId)) {
        console.error('[RedisTokenManager] Session was retired during refresh, not storing');
        return newTokens;
      }
      await this.storeTokens(sessionId, newTokens);
      // The session may have been retired between the check and the write. If so, put the
      // grace TTL back so the write doesn't revive it.
      await this.capToRetiredTtl(sessionId);
      console.error('[RedisTokenManager] ✅ Successfully refreshed and stored Cognito tokens for session');
      return newTokens;
    } catch (error) {
      console.error('[RedisTokenManager] ❌ Failed to refresh Cognito token for session');
      throw error;
    }
  }

  /**
   * Checks if a session has valid tokens
   * @param sessionId Session identifier
   * @returns True if session has tokens
   */
  async hasTokens(sessionId: string): Promise<boolean> {
    return (await this.getEntry(sessionId)) !== null;
  }

  /**
   * Gets token expiry time
   * @param sessionId Session identifier
   * @returns Expiry date or null if not found
   */
  async getTokenExpiry(sessionId: string): Promise<Date | null> {
    const entry = await this.getEntry(sessionId);
    return entry ? new Date(entry.stored.expiresAt) : null;
  }

  /**
   * Checks if a token is expired
   * @param sessionId Session identifier
   * @returns True if expired
   */
  async isTokenExpired(sessionId: string): Promise<boolean> {
    const entry = await this.getEntry(sessionId);
    if (!entry) {
      return true;
    }

    return new Date() >= new Date(entry.stored.expiresAt);
  }

  /**
   * Deletes tokens for a session
   * @param sessionId Session identifier
   */
  async deleteTokens(sessionId: string): Promise<void> {
    const key = this.getKey(sessionId);
    await this.redis.del(key);
    console.error('[RedisTokenManager] Deleted tokens for session');
  }

  /**
   * Retires a session. The retired key holds the end of the grace period and outlives any
   * token key written up to the deadline, so reads enforce the deadline even if a racing write
   * or TTL extension outlives it. SET NX makes this atomic: only one caller can retire a session.
   */
  async retireTokens(sessionId: string, graceMs: number): Promise<boolean> {
    const deadline = Date.now() + graceMs;
    const retiredKey = this.getRetiredKey(sessionId);
    const markerTtlMs = this.tokenTtlMs + graceMs + RETIRED_MARKER_MARGIN_MS;
    const claimed = await this.redis.set(retiredKey, String(deadline), 'PX', markerTtlMs, 'NX');
    if (claimed !== 'OK') {
      return false;
    }
    try {
      // pexpire returns 0 when the token key doesn't exist
      return (await this.redis.pexpire(this.getKey(sessionId), graceMs)) === 1;
    } catch (error) {
      // Undo the retirement so the session isn't left retired with its full TTL; the caller
      // fails and the client can retry with the same refresh token
      await this.redis.del(retiredKey).catch(() => undefined);
      throw error;
    }
  }

  async isRetired(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(this.getRetiredKey(sessionId))) === 1;
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
    const keys = [
      ...(await this.redis.keys(`${this.keyPrefix}*`)),
      ...(await this.redis.keys(`${this.retiredKeyPrefix}*`)),
    ];
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
   * Private helper to get stored tokens from Redis, with whether the session is retired.
   * A retired session past its grace period is deleted and reported as missing.
   */
  private async getEntry(sessionId: string): Promise<{ stored: StoredTokens; retired: boolean } | null> {
    const key = this.getKey(sessionId);
    // Separate GETs, not MGET: the two keys hash to different cluster slots, and Redis
    // Cluster rejects a multi-key command across slots with CROSSSLOT
    const [data, retiredUntil] = await Promise.all([
      this.redis.get(key),
      this.redis.get(this.getRetiredKey(sessionId)),
    ]);

    if (!data) {
      return null;
    }

    if (retiredUntil !== null && Date.now() >= Number(retiredUntil)) {
      await this.redis.del(key);
      return null;
    }

    let stored: StoredTokens;
    try {
      stored = JSON.parse(data) as StoredTokens;
    } catch (error) {
      console.error('[RedisTokenManager] Failed to parse stored tokens for session');
      return null;
    }

    // Sliding expiration: only storeTokens() used to extend the TTL, and that runs just
    // once an hour when the Cognito token is renewed. A session in continuous use could
    // therefore still hit the TTL and drop mid-conversation. Every read pushes it out.
    // Retired sessions keep their short grace TTL.
    const retired = retiredUntil !== null;
    if (!retired) {
      await this.touch(sessionId);
    }

    return { stored, retired };
  }

  /**
   * After a write that may have raced with retireTokens(), cuts the token key's TTL back to
   * whatever is left of the grace period.
   */
  private async capToRetiredTtl(sessionId: string): Promise<void> {
    const retiredUntil = await this.redis.get(this.getRetiredKey(sessionId));
    if (retiredUntil !== null) {
      await this.redis.pexpire(this.getKey(sessionId), Math.max(1, Number(retiredUntil) - Date.now()));
    }
  }

  /**
   * Extends the TTL of an existing token key. The session may have been retired since it was
   * read; the retired marker is read after the extension, and if it's there the grace TTL is
   * put back so the extension doesn't keep a retired key around for the full TTL. retireTokens()
   * sets the marker before it cuts the TTL, so any retirement whose TTL cut this extension
   * undid is seen by the read that follows. (Not a MULTI: the keys are in different cluster
   * slots.)
   */
  private async touch(sessionId: string): Promise<void> {
    try {
      await this.redis.expire(this.getKey(sessionId), Math.floor(this.tokenTtlMs / 1000));
      const retiredUntil = await this.redis.get(this.getRetiredKey(sessionId));
      if (retiredUntil !== null) {
        await this.redis.pexpire(this.getKey(sessionId), Math.max(1, Number(retiredUntil) - Date.now()));
      }
    } catch (error) {
      // A failed TTL extension must not fail the request - the key is still valid.
      console.error('[RedisTokenManager] Failed to extend TTL for token key');
    }
  }

  /**
   * Private helper to generate Redis key
   */
  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  private getRetiredKey(sessionId: string): string {
    return `${this.retiredKeyPrefix}${sessionId}`;
  }
}
