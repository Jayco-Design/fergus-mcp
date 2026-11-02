import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpOAuthApp } from '../http.js';
import { TokenManager } from '../../auth/token-manager.js';
import { RedisTokenManager } from '../../auth/redis-token-manager.js';
import type { ITokenManager } from '../../auth/token-manager-interface.js';
import { FakeRedis } from '../../auth/__tests__/fake-redis.js';
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

function claimsOf(authorization: string | undefined): Record<string, any> {
  const payload = authorization?.replace(/^Bearer /, '').split('.')[1];
  return payload ? JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) : {};
}

/**
 * Fake Fergus API. It records the `tag` claim of the token on every request and echoes it
 * back as the company name. Tokens tagged `slow…` are answered after a delay.
 */
function startFakeFergusApi(): Promise<{ server: Server; baseUrl: string; tagsSeen: string[] }> {
  const tagsSeen: string[] = [];
  const server = createServer((req, res) => {
    const tag = String(claimsOf(req.headers.authorization).tag ?? '');
    tagsSeen.push(tag);
    const respond = () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.startsWith('/users/me')) {
        res.end(JSON.stringify({ data: { id: 1, isOwner: true } }));
      } else if (req.url?.startsWith('/company')) {
        res.end(JSON.stringify({ data: { id: 1, name: `company-for-${tag}` } }));
      } else if (req.url?.startsWith('/pricebooks/search')) {
        res.end(JSON.stringify({ data: [{ name: `result-for-${tag}` }] }));
      } else if (req.url?.startsWith('/pricebooks')) {
        res.end(JSON.stringify({ data: [{ id: 1, supplierName: 'Acme', supplierId: 5 }] }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ message: 'not found' }));
      }
    };
    if (tag.startsWith('slow')) setTimeout(respond, 200);
    else respond();
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, tagsSeen });
    });
  });
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

/** Parses a JSON-RPC message from either a JSON or an SSE response body. */
function parseRpc(body: string): any {
  const dataLine = body.split('\n').find(line => line.startsWith('data: '));
  return JSON.parse(dataLine ? dataLine.slice('data: '.length) : body);
}

function toolText(rpc: any): string {
  return (rpc?.result?.content ?? []).map((item: any) => item.text ?? '').join('\n');
}

const tokenManagers: Record<string, () => ITokenManager> = {
  memory: () => new TokenManager(oauthConfig),
  redis: () => new RedisTokenManager(oauthConfig, 'redis://unused', 24 * 60 * 60 * 1000, new FakeRedis() as any),
};

for (const [storage, createTokenManager] of Object.entries(tokenManagers)) {
  describe(`OAuth token rotation with open MCP sessions (${storage} token storage)`, () => {
    let fergusApi: Awaited<ReturnType<typeof startFakeFergusApi>>;
    let mcpServer: Server;
    let mcpUrl: string;
    let tokenManager: ITokenManager;
    let sessionManager: SessionManager;
    let nextId = 1;

    async function mcpRequest(
      method: 'POST' | 'GET' | 'DELETE',
      options: { body?: unknown; bearer?: string; sessionId?: string } = {},
    ): Promise<Response> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      };
      if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;
      if (options.sessionId) headers['mcp-session-id'] = options.sessionId;
      return fetch(`${mcpUrl}/mcp`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    }

    function initializeBody() {
      return {
        jsonrpc: '2.0',
        id: nextId++,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
      };
    }

    /** Opens an MCP session (one chat) with the given login and returns its session id. */
    async function openSession(bearer: string): Promise<string> {
      const res = await mcpRequest('POST', { body: initializeBody(), bearer });
      assert.equal(res.status, 200, 'initialize should succeed');
      const sessionId = res.headers.get('mcp-session-id');
      assert.ok(sessionId, 'initialize should return an MCP session id');
      await res.text();

      const initialized = await mcpRequest('POST', {
        body: { jsonrpc: '2.0', method: 'notifications/initialized' },
        bearer,
        sessionId,
      });
      await initialized.text();
      return sessionId;
    }

    async function callCompanyInfo(sessionId: string, bearer?: string): Promise<{ status: number; headers: Headers; rpc?: any }> {
      const res = await mcpRequest('POST', {
        body: { jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: 'get-company-info', arguments: {} } },
        bearer,
        sessionId,
      });
      const body = await res.text();
      return { status: res.status, headers: res.headers, rpc: res.status === 200 ? parseRpc(body) : undefined };
    }

    async function refresh(refreshToken: string): Promise<{ status: number; body: any }> {
      const res = await fetch(`${mcpUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
      });
      return { status: res.status, body: await res.json() };
    }

    /** Stores a login (OAuth session id) whose Cognito token belongs to `sub` and carries `tag`. */
    async function storeLogin(oauthSessionId: string, sub: string, tag: string, expiresIn = 3600): Promise<void> {
      await tokenManager.storeTokens(oauthSessionId, {
        accessToken: fakeJwt({ sub, tag }),
        refreshToken: expiresIn > 0 ? `${tag}-refresh` : undefined,
        expiresIn,
        tokenType: 'Bearer',
      });
    }

    function assertToolSucceeded(result: { status: number; rpc?: any }): void {
      assert.equal(result.status, 200);
      assert.notEqual(result.rpc.result.isError, true, JSON.stringify(result.rpc.result));
    }

    beforeEach(async () => {
      fergusApi = await startFakeFergusApi();
      tokenManager = createTokenManager();
      const config: HttpOAuthConfig = {
        fergusBaseUrl: fergusApi.baseUrl,
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
      await close(fergusApi.server);
    });

    describe('refresh', () => {
      test('a single chat keeps working with the rotated token after a refresh', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');

        const refreshed = await refresh('login-1');
        assert.equal(refreshed.status, 200);

        assertToolSucceeded(await callCompanyInfo(chat, refreshed.body.access_token));
      });

      test('every open chat on a login keeps working after that login is refreshed', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const firstChat = await openSession('login-1');
        const secondChat = await openSession('login-1');

        const refreshed = await refresh('login-1');
        assert.equal(refreshed.status, 200);

        assertToolSucceeded(await callCompanyInfo(firstChat, refreshed.body.access_token));
        assertToolSucceeded(await callCompanyInfo(secondChat, refreshed.body.access_token));
      });

      test('a request still carrying the rotated-out token completes during the grace period', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');

        const refreshed = await refresh('login-1');
        assert.equal(refreshed.status, 200);

        assertToolSucceeded(await callCompanyInfo(chat, 'login-1'));
      });

      test('two concurrent refreshes of the same token: only one succeeds', async () => {
        await storeLogin('login-1', 'user-a', 'a1');

        const results = await Promise.all([refresh('login-1'), refresh('login-1')]);

        assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
      });

      test('a request on an open session with a rotated-out token past its grace period gets HTTP 401', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');
        await tokenManager.retireTokens('login-1', 0);

        const result = await callCompanyInfo(chat, 'login-1');
        assert.equal(result.status, 401);
      });

      test('the rotated token keeps the remaining lifetime of the Cognito token it copies', async () => {
        mock.timers.enable({ apis: ['Date'], now: Date.now() });
        try {
          await storeLogin('login-1', 'user-a', 'a1', 1200);
          mock.timers.tick(600_000);

          const refreshed = await refresh('login-1');
          assert.equal(refreshed.status, 200);

          const expiresIn = (await tokenManager.getTokens(refreshed.body.access_token))?.expiresIn;
          assert.equal(expiresIn, 600, 'the copy expires when the original Cognito token does');
        } finally {
          mock.timers.reset();
        }
      });

      test('a rotated-out refresh token cannot be redeemed again', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        assert.equal((await refresh('login-1')).status, 200);

        const reused = await refresh('login-1');
        assert.equal(reused.status, 400);
        assert.equal(reused.body.error, 'invalid_grant');
      });
    });

    describe('per-request tokens', () => {
      test('a request uses the token it was sent with, for the same user', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        await storeLogin('login-2', 'user-a', 'a2');
        const chat = await openSession('login-1');

        fergusApi.tagsSeen.length = 0;
        const result = await callCompanyInfo(chat, 'login-2');
        assertToolSucceeded(result);
        assert.deepEqual(fergusApi.tagsSeen, ['a2']);
      });

      test('overlapping requests on one session each use their own token', async () => {
        await storeLogin('login-slow', 'user-a', 'slow-a');
        await storeLogin('login-fast', 'user-a', 'fast-a');
        const chat = await openSession('login-slow');

        // The supplier-filtered search makes two Fergus calls: a slow price book list, then the
        // search. The fast request arrives in between and must not change the search's token.
        const slowSearch = mcpRequest('POST', {
          body: {
            jsonrpc: '2.0',
            id: nextId++,
            method: 'tools/call',
            params: { name: 'manage-pricebooks', arguments: { action: 'search', searchText: 'pipe', supplierNames: ['Acme'] } },
          },
          bearer: 'login-slow',
          sessionId: chat,
        }).then(async res => ({ status: res.status, rpc: parseRpc(await res.text()) }));
        await new Promise(resolve => setTimeout(resolve, 50));
        const fast = await callCompanyInfo(chat, 'login-fast');
        const slow = await slowSearch;

        assertToolSucceeded(fast);
        assertToolSucceeded(slow);
        assert.match(toolText(fast.rpc), /company-for-fast-a/);
        assert.match(toolText(slow.rpc), /result-for-slow-a/);
      });

      test("a token for a different user gets 404 and doesn't change the session's binding", async () => {
        await storeLogin('login-a', 'user-a', 'a1');
        await storeLogin('login-b', 'user-b', 'b1');
        const chat = await openSession('login-a');

        fergusApi.tagsSeen.length = 0;
        const refused = await callCompanyInfo(chat, 'login-b');
        assert.equal(refused.status, 404);
        assert.deepEqual(fergusApi.tagsSeen, []);
        assert.equal(sessionManager.getOAuthSessionId(chat), 'login-a');
      });
    });

    describe('session user', () => {
      test('initialize is refused when the stored token carries no user id', async () => {
        await tokenManager.storeTokens('login-1', { accessToken: 'not-a-jwt', expiresIn: 3600, tokenType: 'Bearer' });

        const res = await mcpRequest('POST', { body: initializeBody(), bearer: 'login-1' });
        await res.text();
        assert.equal(res.status, 500);
        assert.equal(res.headers.get('mcp-session-id'), null);
      });

      test('the user id falls back to the ID token when the access token is not a JWT', async () => {
        const store = (id: string, sub: string) => tokenManager.storeTokens(id, {
          accessToken: `opaque-${id}`,
          idToken: fakeJwt({ sub }),
          expiresIn: 3600,
          tokenType: 'Bearer',
        });
        await store('login-1', 'user-a');
        await store('login-2', 'user-a');
        await store('login-3', 'user-b');
        const chat = await openSession('login-1');

        assert.equal((await callCompanyInfo(chat, 'login-2')).status, 200);
        assert.equal((await callCompanyInfo(chat, 'login-3')).status, 404);
      });
    });

    describe('401 responses', () => {
      test('initialize without a usable token gets HTTP 401 with WWW-Authenticate', async () => {
        const res = await mcpRequest('POST', { body: initializeBody(), bearer: 'not-a-known-token' });
        const body: any = await res.json();
        assert.equal(res.status, 401);
        assert.equal(body.error.code, -32001, 'the body carries a valid JSON-RPC error code');
        assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer error="invalid_token", resource_metadata="[^"]+\/mcp"$/);
      });

      test('a request on an open session with a bearer token we do not hold gets HTTP 401', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');

        const result = await callCompanyInfo(chat, 'not-a-known-token');
        assert.equal(result.status, 401);
        assert.match(result.headers.get('www-authenticate') ?? '', /^Bearer error="invalid_token", resource_metadata="[^"]+"/);
      });

      test('a request on an open session whose login has gone gets HTTP 401, not a tool error', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');
        await tokenManager.deleteTokens('login-1');

        const result = await callCompanyInfo(chat, 'login-1');
        assert.equal(result.status, 401);
        assert.match(result.headers.get('www-authenticate') ?? '', /^Bearer /);
      });

      test('a request whose token can no longer be refreshed gets HTTP 401', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');
        // Expired, with no refresh token: the Cognito refresh fails but the key still exists
        await storeLogin('login-1', 'user-a', 'a1', 0);

        const result = await callCompanyInfo(chat, 'login-1');
        assert.equal(result.status, 401);
      });

      test('a request on an open session without a bearer token gets HTTP 401 without an error code', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');

        const result = await callCompanyInfo(chat);
        assert.equal(result.status, 401);
        assert.match(result.headers.get('www-authenticate') ?? '', /^Bearer resource_metadata="/);
      });

      test('characters that are not valid in a host name are dropped from WWW-Authenticate', async () => {
        const { port } = mcpServer.address() as AddressInfo;
        const header = await new Promise<string>((resolve, reject) => {
          const req = httpRequest(
            { host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { Host: 'evil"host', 'Content-Type': 'application/json' } },
            res => {
              res.resume();
              resolve(String(res.headers['www-authenticate'] ?? ''));
            },
          );
          req.on('error', reject);
          req.end(JSON.stringify(initializeBody()));
        });
        assert.equal(header, 'Bearer resource_metadata="https://evilhost/.well-known/oauth-protected-resource/mcp"');
      });
    });

    describe('GET and DELETE', () => {
      test('GET without a session id gets HTTP 401 with WWW-Authenticate', async () => {
        const res = await mcpRequest('GET');
        await res.text();
        assert.equal(res.status, 401);
        assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer resource_metadata="/);
      });

      test('GET with a usable token but no session id gets HTTP 400, not 401', async () => {
        await storeLogin('login-1', 'user-a', 'a1');

        const res = await mcpRequest('GET', { bearer: 'login-1' });
        await res.text();
        assert.equal(res.status, 400);
        assert.equal(res.headers.get('www-authenticate'), null);
      });

      test('GET on an open session with a valid token opens the notification stream', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');

        const abort = new AbortController();
        const res = await fetch(`${mcpUrl}/mcp`, {
          method: 'GET',
          headers: { Accept: 'text/event-stream', Authorization: 'Bearer login-1', 'mcp-session-id': chat },
          signal: abort.signal,
        });
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
        abort.abort();
        await res.body?.cancel().catch(() => {});
      });

      test('GET on an open session with a bearer token we do not hold gets HTTP 401', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');

        const res = await mcpRequest('GET', { bearer: 'not-a-known-token', sessionId: chat });
        await res.text();
        assert.equal(res.status, 401);
      });

      test('DELETE needs the session id and a valid token for the session user', async () => {
        await storeLogin('login-a', 'user-a', 'a1');
        await storeLogin('login-b', 'user-b', 'b1');
        const chat = await openSession('login-a');

        const bearerOnly = await mcpRequest('DELETE', { bearer: 'login-a' });
        await bearerOnly.text();
        assert.equal(bearerOnly.status, 400);

        const noToken = await mcpRequest('DELETE', { sessionId: chat });
        await noToken.text();
        assert.equal(noToken.status, 401);

        const otherUser = await mcpRequest('DELETE', { bearer: 'login-b', sessionId: chat });
        await otherUser.text();
        assert.equal(otherUser.status, 404);
        assert.equal(sessionManager.hasSession(chat), true);

        const ok = await mcpRequest('DELETE', { bearer: 'login-a', sessionId: chat });
        await ok.text();
        assert.equal(ok.status, 200);
        assert.equal(sessionManager.hasSession(chat), false);
      });
    });

    describe('unknown sessions', () => {
      test('POST, GET and DELETE on a session we do not have get HTTP 404 so the client starts a new one', async () => {
        await storeLogin('login-1', 'user-a', 'a1');

        const post = await callCompanyInfo('no-such-session', 'login-1');
        assert.equal(post.status, 404);

        for (const method of ['GET', 'DELETE'] as const) {
          const res = await mcpRequest(method, { bearer: 'login-1', sessionId: 'no-such-session' });
          const body: any = await res.json();
          assert.equal(res.status, 404, method);
          assert.equal(body.error.code, -32001, method);
        }
      });

      test('a chat whose session was lost (e.g. a server restart) gets 404, then recovers by re-initializing', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');
        sessionManager.deleteSession(chat);

        const lost = await callCompanyInfo(chat, 'login-1');
        assert.equal(lost.status, 404);

        const reopened = await openSession('login-1');
        assertToolSucceeded(await callCompanyInfo(reopened, 'login-1'));
      });

      test('initialize still opens a new session when the client sends a stale session id with it', async () => {
        await storeLogin('login-1', 'user-a', 'a1');

        const res = await mcpRequest('POST', { body: initializeBody(), bearer: 'login-1', sessionId: 'no-such-session' });
        await res.text();
        assert.equal(res.status, 200);
        const sessionId = res.headers.get('mcp-session-id');
        assert.ok(sessionId && sessionId !== 'no-such-session');
        const initialized = await mcpRequest('POST', {
          body: { jsonrpc: '2.0', method: 'notifications/initialized' },
          bearer: 'login-1',
          sessionId,
        });
        await initialized.text();
        assertToolSucceeded(await callCompanyInfo(sessionId, 'login-1'));
      });

      test('a closed session gets 404', async () => {
        await storeLogin('login-1', 'user-a', 'a1');
        const chat = await openSession('login-1');
        const closed = await mcpRequest('DELETE', { bearer: 'login-1', sessionId: chat });
        await closed.text();

        assert.equal((await callCompanyInfo(chat, 'login-1')).status, 404);
      });

      test('a non-initialize request without a session id is still HTTP 400', async () => {
        await storeLogin('login-1', 'user-a', 'a1');

        const res = await mcpRequest('POST', {
          body: { jsonrpc: '2.0', id: nextId++, method: 'tools/list' },
          bearer: 'login-1',
        });
        await res.text();
        assert.equal(res.status, 400);
      });
    });
  });
}
