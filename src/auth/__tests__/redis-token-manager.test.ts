import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { RedisTokenManager } from '../redis-token-manager.js';
import { FakeRedis } from './fake-redis.js';
import { stubCognitoRefresh, tick, waitForRefreshCalls } from './cognito-fetch-stub.js';

const oauthConfig = {
  userPoolId: 'test-pool',
  clientId: 'test-client',
  clientSecret: 'test-secret',
  region: 'ap-southeast-2',
  domain: 'auth.example.test',
  redirectUri: 'http://127.0.0.1/oauth/callback',
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_KEY = 'fergus-mcp:tokens:login-1';

function tokens(expiresIn: number) {
  return { accessToken: 'cognito-access', refreshToken: 'cognito-refresh', expiresIn, tokenType: 'Bearer' };
}

describe('RedisTokenManager retirement', () => {
  let redis: FakeRedis;
  let manager: RedisTokenManager;

  beforeEach(() => {
    redis = new FakeRedis();
    manager = new RedisTokenManager(oauthConfig, 'redis://unused', THIRTY_DAYS_MS, redis as any);
  });

  test('only the first retire call succeeds', async () => {
    await manager.storeTokens('login-1', tokens(3600));

    const results = await Promise.all([
      manager.retireTokens('login-1', 60_000),
      manager.retireTokens('login-1', 60_000),
    ]);

    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(await manager.isRetired('login-1'), true);
  });

  test('retiring a session that does not exist fails', async () => {
    assert.equal(await manager.retireTokens('missing', 60_000), false);
  });

  test('a retired session serves its token during the grace period without extending its TTL', async () => {
    await manager.storeTokens('login-1', tokens(3600));
    await manager.retireTokens('login-1', 60_000);

    assert.equal(await manager.getAccessToken('login-1'), 'cognito-access');
    assert.equal(await manager.hasTokens('login-1'), true);
    const ttl = await redis.pttl(TOKEN_KEY);
    assert.ok(ttl > 0 && ttl <= 60_000, `token key TTL should be the grace period, was ${ttl}`);
  });

  test('a retired session is gone after the grace period, even if its TTL was pushed out', async () => {
    await manager.storeTokens('login-1', tokens(3600));
    await manager.retireTokens('login-1', 20);
    // Simulate a sliding-TTL extension that raced with the retirement
    await redis.expire(TOKEN_KEY, THIRTY_DAYS_MS / 1000);
    await tick(30);

    assert.equal(await manager.hasTokens('login-1'), false);
    assert.equal(await manager.getAccessToken('login-1'), null);
    assert.equal(await manager.getTokens('login-1'), null);
    assert.equal(await manager.isRetired('login-1'), true, 'the retired marker outlives the grace period');
  });

  test('a read that extends the TTL just after a retirement does not keep the retired key alive', async () => {
    await manager.storeTokens('login-1', tokens(3600));
    // Retire the session between the read and the TTL extension that follows it
    const expire = redis.expire.bind(redis);
    redis.expire = async (key: string, seconds: number) => {
      redis.expire = expire;
      await manager.retireTokens('login-1', 60_000);
      return expire(key, seconds);
    };

    assert.equal(await manager.getAccessToken('login-1'), 'cognito-access', 'the read itself still succeeds');
    const ttl = await redis.pttl(TOKEN_KEY);
    assert.ok(ttl > 0 && ttl <= 60_000, `token key TTL should be back to the grace period, was ${ttl}`);
  });

  test('the retired marker outlives a token key written just before the deadline', async () => {
    await manager.storeTokens('login-1', tokens(3600));
    await manager.retireTokens('login-1', 60_000);

    const markerTtl = await redis.pttl('fergus-mcp:retired:login-1');
    assert.ok(markerTtl > THIRTY_DAYS_MS + 60_000, `marker TTL should cover a full token TTL after the deadline, was ${markerTtl}`);
  });

  test('if shortening the token key fails, the retirement is undone so the client can retry', async () => {
    await manager.storeTokens('login-1', tokens(3600));
    const pexpire = redis.pexpire.bind(redis);
    redis.pexpire = async () => { throw new Error('connection lost'); };

    await assert.rejects(manager.retireTokens('login-1', 60_000), /connection lost/);
    assert.equal(await manager.isRetired('login-1'), false);

    redis.pexpire = pexpire;
    assert.equal(await manager.retireTokens('login-1', 60_000), true, 'a retry succeeds');
  });

  test('getTokens reports the time left on the access token', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    try {
      await manager.storeTokens('login-1', tokens(1200));
      mock.timers.tick(600_000);

      assert.equal((await manager.getTokens('login-1'))?.expiresIn, 600);
    } finally {
      mock.timers.reset();
    }
  });

  describe('with a Cognito refresh in flight', () => {
    let cognito: ReturnType<typeof stubCognitoRefresh>;

    beforeEach(() => {
      cognito = stubCognitoRefresh();
    });

    afterEach(() => {
      cognito.restore();
    });

    test('a refresh that finishes after retirement does not revive the session', async () => {
      // 60s left is inside the 5 minute threshold, so the next read refreshes with Cognito
      await manager.storeTokens('login-1', tokens(60));
      const inFlight = manager.getAccessToken('login-1');
      await waitForRefreshCalls(cognito, 1);

      assert.equal(await manager.retireTokens('login-1', 60_000), true);
      cognito.release('cognito-access-refreshed');

      assert.equal(await inFlight, 'cognito-access-refreshed', 'the caller still gets the refreshed token');
      assert.equal(await manager.isRetired('login-1'), true);
      assert.equal((await manager.getTokens('login-1'))?.accessToken, 'cognito-access', 'refreshed tokens are not stored');
      const ttl = await redis.pttl(TOKEN_KEY);
      assert.ok(ttl > 0 && ttl <= 60_000, `token key TTL should stay at the grace period, was ${ttl}`);
    });

    test('a failed refresh leaves a session retired meanwhile to its grace period', async () => {
      await manager.storeTokens('login-1', tokens(60));
      const inFlight = manager.getAccessToken('login-1');
      await waitForRefreshCalls(cognito, 1);

      assert.equal(await manager.retireTokens('login-1', 60_000), true);
      cognito.fail();

      assert.equal(await inFlight, null);
      assert.equal(await manager.hasTokens('login-1'), true, 'the retired session is not deleted');
    });

    test('a refresh on a session that was not retired is stored as before', async () => {
      await manager.storeTokens('login-1', tokens(60));
      const inFlight = manager.getAccessToken('login-1');
      await waitForRefreshCalls(cognito, 1);
      cognito.release('cognito-access-refreshed');

      assert.equal(await inFlight, 'cognito-access-refreshed');
      assert.equal((await manager.getTokens('login-1'))?.accessToken, 'cognito-access-refreshed');
      assert.ok((await redis.pttl(TOKEN_KEY)) > 60_000);
    });
  });
});
