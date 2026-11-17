import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpOAuthApp } from '../http.js';
import { TokenManager } from '../../auth/token-manager.js';
import type { SessionManager } from '../../auth/session-manager.js';
import type { HttpOAuthConfig, OAuthConfig } from '../../config.js';

const oauthConfig: OAuthConfig = {
  userPoolId: 'test-pool',
  clientId: 'test-client',
  clientSecret: 'test-secret',
  region: 'ap-southeast-2',
  domain: 'auth.example.test',
  redirectUri: 'http://127.0.0.1/oauth/callback',
};

/** An unsigned JWT-shaped token, like the Cognito access tokens the server stores. */
function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
}

/**
 * Token manager whose token lookups can be held open, standing in for the network round
 * trips a shared token store makes. While `hold()` is in effect every lookup waits for the
 * returned release function, and `lookupStarted` resolves once a lookup is waiting.
 */
class HeldTokenManager extends TokenManager {
  private gate: Promise<void> = Promise.resolve();
  private onLookup: () => void = () => undefined;
  lookupStarted: Promise<void> = Promise.resolve();

  hold(): () => void {
    let release!: () => void;
    this.gate = new Promise(resolve => (release = resolve));
    this.lookupStarted = new Promise(resolve => (this.onLookup = resolve));
    return release;
  }

  override async getAccessToken(sessionId: string): Promise<string | null> {
    this.onLookup();
    await this.gate;
    return super.getAccessToken(sessionId);
  }
}

function listen(server: Server): Promise<string> {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise(resolve => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

describe('SSE stream cleanup', () => {
  let fergusApi: Server;
  let mcpServer: Server;
  let mcpUrl: string;
  let tokenManager: HeldTokenManager;
  let sessionManager: SessionManager;
  let nextId = 1;

  const sessionHeaders = (sessionId?: string): Record<string, string> => ({
    Accept: 'application/json, text/event-stream',
    Authorization: 'Bearer login-1',
    ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
  });

  async function post(body: unknown, sessionId?: string): Promise<Response> {
    return fetch(`${mcpUrl}/mcp`, {
      method: 'POST',
      headers: { ...sessionHeaders(sessionId), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function openSession(): Promise<string> {
    const res = await post({
      jsonrpc: '2.0',
      id: nextId++,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    });
    assert.equal(res.status, 200, 'initialize should succeed');
    const sessionId = res.headers.get('mcp-session-id');
    assert.ok(sessionId, 'initialize should return an MCP session id');
    await res.text();
    await (await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId)).text();
    return sessionId;
  }

  /** Opens the session's standalone SSE stream (GET /mcp). */
  function openStream(sessionId: string, signal?: AbortSignal): Promise<Response> {
    return fetch(`${mcpUrl}/mcp`, { headers: sessionHeaders(sessionId), signal });
  }

  beforeEach(async () => {
    fergusApi = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: { id: 1, isOwner: true } }));
    });
    const fergusBaseUrl = await listen(fergusApi);

    tokenManager = new HeldTokenManager(oauthConfig);
    await tokenManager.storeTokens('login-1', {
      accessToken: fakeJwt({ sub: 'user-a' }),
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    const config: HttpOAuthConfig = {
      fergusBaseUrl,
      httpPort: 0,
      httpHost: '127.0.0.1',
      oauth: oauthConfig,
      session: { timeoutMs: 60 * 60 * 1000, tokenTtlMs: 24 * 60 * 60 * 1000, storage: 'memory' },
      rateLimit: { max: 10_000, windowMs: 60_000 },
    };
    const created = createHttpOAuthApp(config, { tokenManager });
    sessionManager = created.sessionManager;
    mcpServer = createServer(created.app);
    mcpUrl = await listen(mcpServer);
  });

  afterEach(async () => {
    sessionManager.shutdown();
    await close(mcpServer);
    await close(fergusApi);
  });

  test('a client that disconnects while its SSE stream is being authorised leaves no stream behind', async () => {
    const sessionId = await openSession();

    // Open the stream, and drop the connection while the server is still looking up the token
    const release = tokenManager.hold();
    const serverSawDisconnect = new Promise<void>(resolve => {
      mcpServer.once('request', (_req, res) => res.once('close', () => resolve()));
    });
    const abandoned = httpRequest(`${mcpUrl}/mcp`, { method: 'GET', agent: false, headers: sessionHeaders(sessionId) });
    abandoned.on('error', () => undefined);
    abandoned.end();
    await tokenManager.lookupStarted;
    abandoned.destroy();
    await serverSawDisconnect;
    release();

    // The session allows one standalone stream at a time. If the abandoned one were still
    // registered, it would hold the session's resources indefinitely and refuse this one.
    const abort = new AbortController();
    const reopened = await openStream(sessionId, abort.signal);
    try {
      assert.equal(reopened.status, 200);
    } finally {
      abort.abort();
    }
  });

  test('deleting a session ends its open SSE stream', async () => {
    const sessionId = await openSession();
    const stream = await openStream(sessionId);
    assert.equal(stream.status, 200);
    const reader = stream.body!.getReader();

    sessionManager.deleteSession(sessionId);

    const drained = (async () => {
      while (!(await reader.read()).done) {
        // discard keep-alive frames until the server ends the stream
      }
      return 'ended' as const;
    })();
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'still open'>(resolve => {
      timer = setTimeout(() => resolve('still open'), 2000);
    });
    try {
      assert.equal(await Promise.race([drained, timedOut]), 'ended');
    } finally {
      clearTimeout(timer);
      await reader.cancel().catch(() => undefined);
    }
  });
});
