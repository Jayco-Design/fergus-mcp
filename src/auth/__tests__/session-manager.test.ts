import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../session-manager.js';

const transport = { close: async () => undefined } as any;
const fergusClient = {} as any;

describe('SessionManager OAuth bindings', () => {
  let sessions: SessionManager;

  beforeEach(() => {
    sessions = new SessionManager({ timeoutMs: 60_000, tokenTtlMs: 60_000, storage: 'memory' });
  });

  afterEach(() => {
    sessions.shutdown();
  });

  test('createSession records the OAuth session id and user', () => {
    sessions.createSession('mcp-1', transport, fergusClient, 'login-1', 'user-a');

    assert.equal(sessions.getOAuthSessionId('mcp-1'), 'login-1');
    assert.equal(sessions.getSession('mcp-1')?.userId, 'user-a');
  });

  test('bindOAuthSessionId moves one MCP session to a new OAuth session id', () => {
    sessions.createSession('mcp-1', transport, fergusClient, 'login-1', 'user-a');
    sessions.createSession('mcp-2', transport, fergusClient, 'login-1', 'user-a');

    assert.equal(sessions.bindOAuthSessionId('mcp-1', 'login-2'), true);
    assert.equal(sessions.getOAuthSessionId('mcp-1'), 'login-2');
    assert.equal(sessions.getOAuthSessionId('mcp-2'), 'login-1');
    assert.equal(sessions.getSession('mcp-1')?.userId, 'user-a');
  });

  test('bindOAuthSessionId returns false for an unknown MCP session', () => {
    assert.equal(sessions.bindOAuthSessionId('missing', 'login-1'), false);
  });
});

describe('SessionManager session deletion', () => {
  let sessions: SessionManager;

  beforeEach(() => {
    sessions = new SessionManager({ timeoutMs: 60_000, tokenTtlMs: 60_000, storage: 'memory' });
  });

  afterEach(() => {
    sessions.shutdown();
  });

  test('deleteSession closes the transport', () => {
    let closed = 0;
    const closable = { close: async () => { closed++; } } as any;
    sessions.createSession('mcp-1', closable, fergusClient);

    sessions.deleteSession('mcp-1');

    assert.equal(closed, 1);
    assert.equal(sessions.hasSession('mcp-1'), false);
  });

  test('a transport whose close handler deletes the session is closed once', () => {
    let closed = 0;
    const closable = {
      close: async () => {
        closed++;
        sessions.deleteSession('mcp-1');
      },
    } as any;
    sessions.createSession('mcp-1', closable, fergusClient);

    sessions.deleteSession('mcp-1');

    assert.equal(closed, 1);
  });

  test('sessions idle for longer than the timeout have their transport closed', () => {
    let closed = 0;
    const closable = { close: async () => { closed++; } } as any;
    sessions.createSession('mcp-1', closable, fergusClient);
    sessions.getSession('mcp-1')!.lastAccessedAt = new Date(Date.now() - 120_000);

    assert.equal(sessions.cleanupInactiveSessions(), 1);
    assert.equal(closed, 1);
  });
});
