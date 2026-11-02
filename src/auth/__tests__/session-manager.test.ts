import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../session-manager.js';

const transport = {} as any;
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
