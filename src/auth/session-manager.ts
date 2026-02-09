/**
 * Session manager for tracking MCP sessions with OAuth authentication
 * Manages session lifecycle, transport instances, and FergusClient instances
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FergusClient } from '../fergus-client.js';
import { SessionConfig } from '../config.js';

export interface SessionData {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  fergusClient: FergusClient;
  createdAt: Date;
  lastAccessedAt: Date;
  oauthSessionId?: string;
}

/**
 * Session manager class for managing MCP sessions
 */
export class SessionManager {
  private sessions = new Map<string, SessionData>();
  private oauthSessionToMcpSession = new Map<string, string>();
  private config: SessionConfig;
  private cleanupIntervalId?: NodeJS.Timeout;

  constructor(config: SessionConfig) {
    this.config = config;

    // Start automatic cleanup of inactive sessions
    this.startCleanupTimer();
  }

  /**
   * Creates a new session
   * @param sessionId Unique session identifier
   * @param transport MCP transport instance
   * @param fergusClient FergusClient instance for this session
   */
  createSession(
    sessionId: string,
    transport: StreamableHTTPServerTransport,
    fergusClient: FergusClient,
    oauthSessionId?: string
  ): void {
    const now = new Date();

    this.sessions.set(sessionId, {
      sessionId,
      transport,
      fergusClient,
      createdAt: now,
      lastAccessedAt: now,
      oauthSessionId,
    });

    if (oauthSessionId) {
      this.oauthSessionToMcpSession.set(oauthSessionId, sessionId);
    }

    console.error(`[SessionManager] Created session ${sessionId} at ${now.toISOString()}`);
  }

  /**
   * Gets session data by ID
   * @param sessionId Session identifier
   * @returns Session data or null if not found
   */
  getSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Update last accessed time
      session.lastAccessedAt = new Date();
    }
    console.error(`[SessionManager] Fetched session ${sessionId} at ${session?.lastAccessedAt.toISOString()}`);

    return session || null;
  }

  /**
   * Gets session data by OAuth session ID
   */
  getSessionByOAuthSessionId(oauthSessionId: string): SessionData | null {
    const sessionId = this.oauthSessionToMcpSession.get(oauthSessionId);
    if (!sessionId) {
      return null;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.oauthSessionToMcpSession.delete(oauthSessionId);
      return null;
    }
    session.lastAccessedAt = new Date();
    console.error(
      `[SessionManager] Fetched session ${sessionId} via OAuth session ${oauthSessionId}`
    );
    return session;
  }

  /**
   * Checks if a session exists
   * @param sessionId Session identifier
   * @returns True if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Updates the last accessed time for a session
   * @param sessionId Session identifier
   */
  updateLastAccessed(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.lastAccessedAt = new Date();
    }
  }

  /**
   * Deletes a session
   * @param sessionId Session identifier
   */
  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Close the transport if possible
      try {
        // Note: StreamableHTTPServerTransport doesn't have an explicit close method
        // The transport will be garbage collected when the session is deleted
      } catch (error) {
        console.error(`[SessionManager] Error closing transport for session ${sessionId}:`, error);
      }

      this.sessions.delete(sessionId);
      if (session.oauthSessionId) {
        this.oauthSessionToMcpSession.delete(session.oauthSessionId);
      }
      console.error(`[SessionManager] Deleted session ${sessionId}`);
    }
  }

  /**
   * Gets all active session IDs
   * @returns Array of session IDs
   */
  getAllSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Gets the number of active sessions
   * @returns Number of sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Cleans up inactive sessions that have exceeded the timeout
   * Note: This only cleans up MCP transport sessions, NOT OAuth tokens
   * OAuth tokens are managed separately by TokenManager and have their own TTL
   * @returns Number of sessions cleaned up
   */
  cleanupInactiveSessions(): number {
    const now = new Date();
    const timeoutMs = this.config.timeoutMs;
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveMs = now.getTime() - session.lastAccessedAt.getTime();

      if (inactiveMs > timeoutMs) {
        console.error(
          `[SessionManager] Session ${sessionId} inactive for ${Math.round(inactiveMs / 1000)}s, cleaning up`
        );
        this.deleteSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.error(`[SessionManager] Cleaned up ${cleaned} inactive session(s)`);
    }

    return cleaned;
  }

  /**
   * Starts automatic cleanup timer
   */
  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    const cleanupIntervalMs = 5 * 60 * 1000;

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupInactiveSessions();
    }, cleanupIntervalMs);

    console.error(`[SessionManager] Started automatic cleanup timer (every ${cleanupIntervalMs / 1000}s)`);
  }

  /**
   * Stops automatic cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = undefined;
      console.error('[SessionManager] Stopped automatic cleanup timer');
    }
  }

  /**
   * Gets session statistics
   * @returns Object with session statistics
   */
  getStats(): {
    totalSessions: number;
    oldestSession: Date | null;
    newestSession: Date | null;
    averageAgeMs: number;
  } {
    const now = new Date();
    let oldestSession: Date | null = null;
    let newestSession: Date | null = null;
    let totalAgeMs = 0;

    for (const session of this.sessions.values()) {
      if (!oldestSession || session.createdAt < oldestSession) {
        oldestSession = session.createdAt;
      }
      if (!newestSession || session.createdAt > newestSession) {
        newestSession = session.createdAt;
      }
      totalAgeMs += now.getTime() - session.createdAt.getTime();
    }

    return {
      totalSessions: this.sessions.size,
      oldestSession,
      newestSession,
      averageAgeMs: this.sessions.size > 0 ? totalAgeMs / this.sessions.size : 0,
    };
  }

  /**
   * Clears all sessions (for shutdown or testing)
   */
  clearAll(): void {
    const count = this.sessions.size;

    for (const sessionId of this.sessions.keys()) {
      this.deleteSession(sessionId);
    }

    console.error(`[SessionManager] Cleared all ${count} session(s)`);
  }

  /**
   * Shuts down the session manager
   * Stops cleanup timer and clears all sessions
   */
  shutdown(): void {
    console.error('[SessionManager] Shutting down...');
    this.stopCleanupTimer();
    this.clearAll();
  }
}
