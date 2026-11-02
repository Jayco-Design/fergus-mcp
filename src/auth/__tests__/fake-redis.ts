/**
 * Minimal in-memory stand-in for the ioredis client, covering only the commands
 * RedisTokenManager uses, plus MGET and MULTI. Keys expire on read, like Redis's lazy expiry.
 * Like Redis Cluster, it rejects a multi-key command or a MULTI whose keys are in different
 * hash slots.
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
            assertSameSlot(queued.map(([, args]) => String(args[0])));
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
    assertSameSlot(keys);
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
    assertSameSlot(keys);
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

/** Throws Redis Cluster's CROSSSLOT error unless every key hashes to the same slot. */
function assertSameSlot(keys: string[]): void {
  if (new Set(keys.map(keySlot)).size > 1) {
    throw new Error("CROSSSLOT Keys in request don't hash to the same slot");
  }
}

/** Redis Cluster key slot: CRC16 (XMODEM) of the key, or of its {hash tag}, mod 16384. */
function keySlot(key: string): number {
  const open = key.indexOf('{');
  if (open !== -1) {
    const close = key.indexOf('}', open + 1);
    if (close > open + 1) key = key.slice(open + 1, close);
  }
  let crc = 0;
  for (const byte of Buffer.from(key)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc % 16384;
}
