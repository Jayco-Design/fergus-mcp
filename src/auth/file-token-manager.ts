/**
 * File-based Token Manager
 * Stores tokens in the file system for local development persistence
 */

import fs from 'fs/promises';
import path from 'path';
import { ITokenManager, OAuthTokens } from './token-manager-interface.js';
import { refreshAccessToken } from './oauth-handler.js';
import { OAuthConfig } from '../config.js';

const SESSIONS_DIR = '.sessions';

interface StoredSessionData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  storedAt: number;
}

export class FileTokenManager implements ITokenManager {
  private sessionsPath: string;
  private oauthConfig?: OAuthConfig;

  constructor(oauthConfig?: OAuthConfig, baseDir: string = process.cwd()) {
    this.oauthConfig = oauthConfig;
    this.sessionsPath = path.join(baseDir, SESSIONS_DIR);
  }

  /**
   * Initialize sessions directory
   */
  private async ensureSessionsDir(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create sessions directory:', error);
    }
  }

  /**
   * Get file path for a session
   */
  private getSessionFilePath(sessionId: string): string {
    return path.join(this.sessionsPath, `${sessionId}.json`);
  }

  /**
   * Store tokens for a session
   */
  async storeTokens(sessionId: string, tokens: OAuthTokens): Promise<void> {
    await this.ensureSessionsDir();

    const sessionData = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + (tokens.expiresIn * 1000),
      storedAt: Date.now(),
    };

    const filePath = this.getSessionFilePath(sessionId);
    await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
    console.log(`[FileTokenManager] Stored tokens for session ${sessionId}`);
  }

  /**
   * Get access token for a session (auto-refresh if needed)
   */
  async getAccessToken(sessionId: string): Promise<string | null> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      const sessionData = JSON.parse(data);

      // Check if token is expired
      if (Date.now() >= sessionData.expiresAt - 60000) { // 1 minute buffer
        console.log(`[FileTokenManager] Token expired for session ${sessionId}`);

        // Try to refresh
        if (sessionData.refreshToken) {
          console.log(`[FileTokenManager] Attempting to refresh token for session ${sessionId}`);
          // Note: We can't refresh here without OAuth handler access
          // The caller should handle refresh on 401 errors
          return null;
        }

        return null;
      }

      return sessionData.accessToken;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`[FileTokenManager] No session found for ${sessionId}`);
        return null;
      }
      console.error(`[FileTokenManager] Error reading session:`, error);
      return null;
    }
  }

  /**
   * Get refresh token for a session
   */
  async getRefreshToken(sessionId: string): Promise<string | null> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      const sessionData = JSON.parse(data);
      return sessionData.refreshToken || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete tokens for a session
   */
  async deleteTokens(sessionId: string): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      await fs.unlink(filePath);
      console.log(`[FileTokenManager] Deleted session ${sessionId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[FileTokenManager] Error deleting session:`, error);
      }
    }
  }

  /**
   * Get all tokens for a session
   */
  async getTokens(sessionId: string): Promise<OAuthTokens | null> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      const sessionData: StoredSessionData = JSON.parse(data);

      return {
        accessToken: sessionData.accessToken,
        refreshToken: sessionData.refreshToken,
        expiresIn: Math.max(0, Math.floor((sessionData.expiresAt - Date.now()) / 1000)),
        tokenType: 'Bearer',
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh token if needed
   */
  async refreshTokenIfNeeded(sessionId: string): Promise<void> {
    try {
      const tokens = await this.getTokens(sessionId);
      if (!tokens || !tokens.refreshToken || !this.oauthConfig) return;

      const sessionData = await this.readSessionData(sessionId);
      if (!sessionData) return;

      // Check if token is expiring soon (within 5 minutes)
      if (Date.now() >= sessionData.expiresAt - 300000) {
        console.log(`[FileTokenManager] Refreshing token for session ${sessionId}`);
        const newTokens = await refreshAccessToken(this.oauthConfig, tokens.refreshToken);
        await this.storeTokens(sessionId, newTokens);
      }
    } catch (error) {
      console.error(`[FileTokenManager] Error refreshing token:`, error);
    }
  }

  /**
   * Check if session has tokens
   */
  async hasTokens(sessionId: string): Promise<boolean> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get token expiry time
   */
  async getTokenExpiry(sessionId: string): Promise<Date | null> {
    const sessionData = await this.readSessionData(sessionId);
    return sessionData ? new Date(sessionData.expiresAt) : null;
  }

  /**
   * Check if token is expired
   */
  async isTokenExpired(sessionId: string): Promise<boolean> {
    const sessionData = await this.readSessionData(sessionId);
    if (!sessionData) return true;
    return Date.now() >= sessionData.expiresAt;
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens(): void {
    // Run async cleanup in background
    this.cleanupOldSessions().catch(error => {
      console.error('[FileTokenManager] Cleanup error:', error);
    });
  }

  /**
   * Get session count
   */
  async getSessionCount(): Promise<number> {
    try {
      await this.ensureSessionsDir();
      const files = await fs.readdir(this.sessionsPath);
      return files.filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  /**
   * Clear all sessions
   */
  async clearAll(): Promise<void> {
    try {
      await this.ensureSessionsDir();
      const files = await fs.readdir(this.sessionsPath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(this.sessionsPath, file));
        }
      }
      console.log('[FileTokenManager] Cleared all sessions');
    } catch (error) {
      console.error('[FileTokenManager] Error clearing sessions:', error);
    }
  }

  /**
   * Helper: Read session data from file
   */
  private async readSessionData(sessionId: string): Promise<StoredSessionData | null> {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Clean up old sessions (optional cleanup method)
   */
  private async cleanupOldSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      await this.ensureSessionsDir();
      const files = await fs.readdir(this.sessionsPath);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.sessionsPath, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const sessionData = JSON.parse(data);

        if (Date.now() - sessionData.storedAt > maxAgeMs) {
          await fs.unlink(filePath);
          console.log(`[FileTokenManager] Cleaned up old session: ${file}`);
        }
      }
    } catch (error) {
      console.error('[FileTokenManager] Error cleaning up sessions:', error);
    }
  }
}
