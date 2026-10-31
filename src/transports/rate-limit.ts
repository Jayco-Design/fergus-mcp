/**
 * Per-client rate limiting for the HTTP transport.
 *
 * Clients are identified by their bearer token when one is present, otherwise by IP.
 * Tokens are hashed before use as a key so they are never written to the store.
 */

import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { Redis } from 'ioredis';
import type { RateLimitConfig } from '../config.js';

type KeyRequest = Pick<Request, 'headers' | 'ip'>;

export function rateLimitKey(req: KeyRequest): string {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token) {
      const digest = createHash('sha256').update(token).digest('hex').slice(0, 32);
      return `token:${digest}`;
    }
  }
  return req.ip ? `ip:${ipKeyGenerator(req.ip)}` : 'ip:unknown';
}

export function createRateLimiter(config: RateLimitConfig, redisUrl?: string): RequestHandler {
  let store: RedisStore | undefined;

  if (redisUrl) {
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    redis.on('error', (error: Error) => {
      console.error('[RateLimit] Redis connection error:', error);
    });
    store = new RedisStore({
      prefix: 'ratelimit:',
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
    });
    console.error('[RateLimit] Using Redis storage');
  } else {
    console.error('[RateLimit] Using in-memory storage');
  }

  return rateLimit({
    windowMs: config.windowMs,
    limit: config.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    skip: (req) => req.path === '/health',
    // If the store is unavailable, let requests through rather than failing closed.
    passOnStoreError: true,
    store,
    message: {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, please retry later',
    },
  });
}
