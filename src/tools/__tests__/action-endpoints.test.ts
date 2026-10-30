/**
 * Tests for the bodyless action endpoints: manage-jobs finalize and
 * manage-sites archive/restore.
 *
 * The Partner API's finalise, archive and restore endpoints only accept
 * Content-Type: text/plain. The bug fixed here was the MCP sending these
 * with FergusClient's default application/json and a "{}" body, so every
 * finalize/archive/restore failed with a 400 ("The Content-Type must be
 * 'text/plain'") before reaching Fergus.
 *
 * These run the real FergusClient against a stubbed fetch that enforces the
 * same header rule, so a regression fails here the way it fails in prod.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { handleManageJobs } from '../jobs.js';
import { handleManageSites } from '../sites.js';
import { FergusClient } from '../../fergus-client.js';

const BASE_URL = 'https://api.test';

const TEXT_PLAIN_ROUTES: Array<{ method: string; path: RegExp }> = [
  { method: 'PUT', path: /^\/jobs\/\d+\/finalise$/ },
  { method: 'POST', path: /^\/sites\/\d+\/archive$/ },
  { method: 'POST', path: /^\/sites\/\d+\/restore$/ },
];

interface RecordedRequest {
  method: string;
  path: string;
  contentType: string | null;
  body: unknown;
}

let requests: RecordedRequest[];
let originalFetch: typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  requests = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const contentType = new Headers(init?.headers).get('content-type');
    requests.push({ method, path: url.pathname, contentType, body: init?.body });

    const isTextPlainRoute = TEXT_PLAIN_ROUTES.some(
      (r) => r.method === method && r.path.test(url.pathname)
    );
    if (isTextPlainRoute && !contentType?.includes('text/plain')) {
      return jsonResponse(400, {
        message: "Validation Failed: [<headers/content-type>: The Content-Type must be 'text/plain']",
      });
    }
    if (method === 'POST' && url.pathname.endsWith('/archive')) {
      return new Response(null, { status: 204 });
    }
    return jsonResponse(200, { data: { id: 1 } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function client() {
  return new FergusClient({ apiToken: 'token', baseUrl: BASE_URL });
}

describe('bodyless action endpoints send text/plain with no body', () => {
  test('manage-jobs finalize', async () => {
    await handleManageJobs(client(), { action: 'finalize', jobId: '22902326' });

    assert.deepEqual(requests, [
      { method: 'PUT', path: '/jobs/22902326/finalise', contentType: 'text/plain', body: undefined },
    ]);
  });

  test('manage-sites archive', async () => {
    const result = await handleManageSites(client(), { action: 'archive', siteId: 42 });

    assert.deepEqual(requests, [
      { method: 'POST', path: '/sites/42/archive', contentType: 'text/plain', body: undefined },
    ]);
    // The 204 has no body, so the tool reports success rather than "{}"
    assert.deepEqual(JSON.parse(result.content[0].text), { success: true });
  });

  test('manage-sites restore', async () => {
    await handleManageSites(client(), { action: 'restore', siteId: 42 });

    assert.deepEqual(requests, [
      { method: 'POST', path: '/sites/42/restore', contentType: 'text/plain', body: undefined },
    ]);
  });
});

describe('other requests still send JSON', () => {
  for (const method of ['post', 'put', 'patch'] as const) {
    test(method, async () => {
      await client()[method]('/jobs/1', { title: 'x' });

      assert.equal(requests.length, 1);
      assert.equal(requests[0].contentType, 'application/json');
      assert.equal(requests[0].body, '{"title":"x"}');
    });
  }
});
