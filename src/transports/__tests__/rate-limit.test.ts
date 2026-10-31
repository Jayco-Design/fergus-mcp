import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimitKey } from '../rate-limit.js';
import { loadRateLimitConfig } from '../../config.js';

describe('rateLimitKey', () => {
  test('keys by a hash of the bearer token when one is present', () => {
    const key = rateLimitKey({ headers: { authorization: 'Bearer abc123' }, ip: '1.2.3.4' } as any);
    assert.match(key, /^token:[0-9a-f]{32}$/);
    assert.ok(!key.includes('abc123'), 'raw token must not appear in the key');
  });

  test('is stable for the same token and different for different tokens', () => {
    const a = rateLimitKey({ headers: { authorization: 'Bearer one' }, ip: '1.2.3.4' } as any);
    const b = rateLimitKey({ headers: { authorization: 'Bearer one' }, ip: '5.6.7.8' } as any);
    const c = rateLimitKey({ headers: { authorization: 'Bearer two' }, ip: '1.2.3.4' } as any);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  test('falls back to the client IP without a bearer token', () => {
    assert.equal(rateLimitKey({ headers: {}, ip: '1.2.3.4' } as any), 'ip:1.2.3.4');
    assert.equal(rateLimitKey({ headers: { authorization: 'Basic xyz' }, ip: '1.2.3.4' } as any), 'ip:1.2.3.4');
    assert.equal(rateLimitKey({ headers: { authorization: 'Bearer ' }, ip: '1.2.3.4' } as any), 'ip:1.2.3.4');
  });

  test('groups IPv6 addresses by subnet', () => {
    const a = rateLimitKey({ headers: {}, ip: '2001:db8:abcd:0012::1' } as any);
    const b = rateLimitKey({ headers: {}, ip: '2001:db8:abcd:0012::2' } as any);
    assert.equal(a, b);
  });

  test('handles a missing IP', () => {
    assert.equal(rateLimitKey({ headers: {}, ip: undefined } as any), 'ip:unknown');
  });
});

describe('loadRateLimitConfig', () => {
  const originalMax = process.env.RATE_LIMIT_MAX;
  const originalWindow = process.env.RATE_LIMIT_WINDOW_MS;

  afterEach(() => {
    if (originalMax === undefined) delete process.env.RATE_LIMIT_MAX; else process.env.RATE_LIMIT_MAX = originalMax;
    if (originalWindow === undefined) delete process.env.RATE_LIMIT_WINDOW_MS; else process.env.RATE_LIMIT_WINDOW_MS = originalWindow;
  });

  test('uses defaults when unset', () => {
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    assert.deepEqual(loadRateLimitConfig(), { max: 100, windowMs: 60000 });
  });

  test('reads values from the environment', () => {
    process.env.RATE_LIMIT_MAX = '20';
    process.env.RATE_LIMIT_WINDOW_MS = '1000';
    assert.deepEqual(loadRateLimitConfig(), { max: 20, windowMs: 1000 });
  });

  test('rejects non-positive or non-numeric values', () => {
    process.env.RATE_LIMIT_MAX = '0';
    assert.throws(() => loadRateLimitConfig(), /RATE_LIMIT_MAX/);
    process.env.RATE_LIMIT_MAX = '10';
    process.env.RATE_LIMIT_WINDOW_MS = 'soon';
    assert.throws(() => loadRateLimitConfig(), /RATE_LIMIT_WINDOW_MS/);
  });
});
