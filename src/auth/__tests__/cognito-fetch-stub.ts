/**
 * Replaces global fetch so Cognito token refreshes can be held open and answered on cue,
 * letting tests interleave a refresh with other work. Other requests fail loudly.
 */
export function stubCognitoRefresh(): { release: (accessToken: string) => void; fail: () => void; calls: () => number; restore: () => void } {
  const originalFetch = globalThis.fetch;
  const pending: Array<(response: Response) => void> = [];
  let calls = 0;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.endsWith('/oauth2/token')) {
      throw new Error(`Unexpected fetch in test: ${url}`);
    }
    calls++;
    return new Promise<Response>(resolve => pending.push(resolve));
  }) as typeof fetch;

  return {
    release(accessToken: string) {
      const resolve = pending.shift();
      if (!resolve) throw new Error('No Cognito refresh is waiting');
      resolve(new Response(
        JSON.stringify({ access_token: accessToken, expires_in: 3600, token_type: 'Bearer' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    },
    /** Answers the oldest waiting refresh as Cognito does for a revoked refresh token. */
    fail() {
      const resolve = pending.shift();
      if (!resolve) throw new Error('No Cognito refresh is waiting');
      resolve(new Response(
        JSON.stringify({ error: 'invalid_grant' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ));
    },
    calls: () => calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

/** Lets pending promise callbacks and I/O run. */
export function tick(ms = 10): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Waits until the stub has seen `count` refresh calls. */
export async function waitForRefreshCalls(stub: { calls: () => number }, count: number): Promise<void> {
  for (let i = 0; i < 100 && stub.calls() < count; i++) await tick(5);
  if (stub.calls() < count) throw new Error(`Expected ${count} Cognito refresh call(s), saw ${stub.calls()}`);
}
