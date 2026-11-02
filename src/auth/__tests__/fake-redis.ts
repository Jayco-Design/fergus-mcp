/**
 * Minimal in-memory stand-in for the ioredis client, covering only the commands
 * RedisTokenManager uses. Keys expire on read, like Redis's lazy expiry.
 */
export class FakeRedis {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  on(): this {
    return this;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  /**
   * MULTI ... EXEC. Commands run back to back when exec() is called, with nothing in between,
   * and resolve to [error, result] pairs like ioredis.
   */
  multi() {
    const queued: Array<[string, unknown[]]> = [];
    const chain: any = new Proxy({}, {
      get: (_target, name: string) => {
        if (name === 'exec') {
          return async () => {
            // The fake's commands do all their work synchronously, so starting them in one
            // loop keeps the batch atomic
            const pending = queued.map(([command, args]) => (this as any)[command](...args) as Promise<unknown>);
            return Promise.all(pending.map(p => p.then(result => [null, result], error => [error, null])));
          };
        }
        return (...args: unknown[]) => {
          queued.push([name, args]);
          return chain;
        };
      },
    });
    return chain;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map(key => this.live(key)?.value ?? null);
  }

  /** Supports SET key value [PX ms | EX s] [NX]. */
  async set(key: string, value: string, ...args: (string | number)[]): Promise<'OK' | null> {
    let expiresAt: number | undefined;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      const arg = String(args[i]).toUpperCase();
      if (arg === 'PX') expiresAt = Date.now() + Number(args[++i]);
      else if (arg === 'EX') expiresAt = Date.now() + Number(args[++i]) * 1000;
      else if (arg === 'NX') nx = true;
    }
    if (nx && this.live(key)) return null;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async exists(key: string): Promise<number> {
    return this.live(key) ? 1 : 0;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) if (this.store.delete(key)) removed++;
    return removed;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.pexpire(key, seconds * 1000);
  }

  async pexpire(key: string, ms: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + ms;
    return 1;
  }

  /** Milliseconds left on a key: -2 if missing, -1 if it has no expiry. */
  async pttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return -2;
    return entry.expiresAt === undefined ? -1 : entry.expiresAt - Date.now();
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace(/\*$/, '');
    return [...this.store.keys()].filter(key => key.startsWith(prefix) && this.live(key));
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }

  private live(key: string) {
    const entry = this.store.get(key);
    if (entry?.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }
}
