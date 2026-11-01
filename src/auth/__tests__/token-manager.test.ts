import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { TokenManager } from '../token-manager.js';
import { stubCognitoRefresh, waitForRefreshCalls } from './cognito-fetch-stub.js';

const oauthConfig = {
  userPoolId: 'test-pool',
  clientId: 'test-client',
  clientSecret: 'test-secret',
  region: 'ap-southeast-2',
  domain: 'auth.example.test',
  redirectUri: 'http://127.0.0.1/oauth/callback',
};

function tokens(expiresIn: number) {
  return { accessToken: 'cognito-access', refreshToken: 'cognito-refresh', expiresIn, tokenType: 'Bearer' };
}

describe('TokenManager retirement', () => {
  test('a retired session still serves its access token during the grace period', async () => {
    const manager = new TokenManager(oauthConfig);
    manager.storeTokens('login-1', tokens(3600));

    manager.retireTokens('login-1', 60_000);

    assert.equal(manager.isRetired('login-1'), true);
    assert.equal(manager.hasTokens('login-1'), true);
    assert.equal(await manager.getAccessToken('login-1'), 'cognito-access');
  });

  test('a retired session is gone once the grace period ends', async () => {
    const manager = new TokenManager(oauthConfig);
    manager.storeTokens('login-1', tokens(3600));

    manager.retireTokens('login-1', 0);

    assert.equal(manager.hasTokens('login-1'), false);
    assert.equal(await manager.getAccessToken('login-1'), null);
    assert.equal(manager.getTokens('login-1'), null);
  });

  test('a retired session is never refreshed, even when its access token is about to expire', async () => {
    const manager = new TokenManager(oauthConfig);
    // 60s left is inside the 5 minute refresh threshold; a refresh would call Cognito and fail
    manager.storeTokens('login-1', tokens(60));

    manager.retireTokens('login-1', 60_000);

    assert.equal(await manager.getAccessToken('login-1'), 'cognito-access');
  });

  test('only the first retire call succeeds', () => {
    const manager = new TokenManager(oauthConfig);
    manager.storeTokens('login-1', tokens(3600));

    assert.equal(manager.retireTokens('login-1', 60_000), true);
    assert.equal(manager.retireTokens('login-1', 60_000), false);
    assert.equal(manager.retireTokens('missing', 60_000), false);
  });

  test('a retired entry is removed when its grace period ends, without being read', async () => {
    const manager = new TokenManager(oauthConfig);
    manager.storeTokens('login-1', tokens(3600));

    // Freeze the clock so the timer fires while Date.now() is still short of the deadline,
    // as it can when a timer fires a moment early
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    try {
      manager.retireTokens('login-1', 10);
      await new Promise(resolve => setTimeout(resolve, 30));

      assert.equal(manager.getSessionCount(), 0);
    } finally {
      mock.timers.reset();
    }
  });

  test('a Cognito refresh that finishes after retirement does not revive the session', async () => {
    const cognito = stubCognitoRefresh();
    try {
      const manager = new TokenManager(oauthConfig);
      manager.storeTokens('login-1', tokens(60));
      const inFlight = manager.getAccessToken('login-1');
      await waitForRefreshCalls(cognito, 1);

      manager.retireTokens('login-1', 60_000);
      cognito.release('cognito-access-refreshed');

      assert.equal(await inFlight, 'cognito-access-refreshed', 'the caller still gets the refreshed token');
      assert.equal(manager.isRetired('login-1'), true);
      assert.equal(manager.getTokens('login-1')?.accessToken, 'cognito-access', 'refreshed tokens are not stored');
    } finally {
      cognito.restore();
    }
  });

  test('a failed Cognito refresh leaves a session retired meanwhile to its grace period', async () => {
    const cognito = stubCognitoRefresh();
    try {
      const manager = new TokenManager(oauthConfig);
      manager.storeTokens('login-1', tokens(60));
      const inFlight = manager.getAccessToken('login-1');
      await waitForRefreshCalls(cognito, 1);

      manager.retireTokens('login-1', 60_000);
      cognito.fail();

      assert.equal(await inFlight, null);
      assert.equal(manager.hasTokens('login-1'), true, 'the retired session is not deleted');
    } finally {
      cognito.restore();
    }
  });

  test('getTokens reports the time left on the access token', () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    try {
      const manager = new TokenManager(oauthConfig);
      manager.storeTokens('login-1', tokens(1200));
      mock.timers.tick(600_000);

      assert.equal((manager.getTokens('login-1'))?.expiresIn, 600);
    } finally {
      mock.timers.reset();
    }
  });

  test('sessions that were not retired are not reported as retired', () => {
    const manager = new TokenManager(oauthConfig);
    manager.storeTokens('login-1', tokens(3600));

    assert.equal(manager.isRetired('login-1'), false);
    assert.equal(manager.isRetired('missing'), false);
  });
});
