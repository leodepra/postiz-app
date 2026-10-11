import { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { openEphemeral, sealEphemeral } from '@gitroom/helpers/security/ephemeral-cipher';
import { validateSupabaseDatabase } from '@gitroom/helpers/security/supabase-database';

type Entry = { value: unknown; expires: number };
type Change<T> = { entry: Entry | null; result: T };

/** Only the commands used by this application; this is not a Redis emulator. */
export class PostgresEphemeralStore {
  private client?: PrismaClient;
  private database() {
    validateSupabaseDatabase();
    return this.client ||= new PrismaClient({ log: [] });
  }

  private async change<T>(key: string, mutate: (entry: Entry | null, now: number) => Change<T>): Promise<T> {
    const hash = createHash('sha256').update(key).digest('hex');
    return this.database().$transaction(async tx => {
      // A transaction-scoped lock also serializes creation of an absent key.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${hash}, 0))`;
      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      const [row] = await tx.$queryRaw<{ value: string; expires_at: Date }[]>`
        SELECT value, expires_at FROM postiz_private.ephemeral WHERE key_hash = ${hash}`;
      let current: Entry | null = null;
      if (row && row.expires_at.getTime() > now.getTime()) {
        current = openEphemeral(row.value, hash) as Entry;
        if (!current || current.expires !== row.expires_at.getTime()) throw new Error('Invalid ephemeral expiry');
      }
      const changed = mutate(current, now.getTime());
      if (changed.entry) {
        // Authenticate expiry as well as content; editing the SQL timestamp must
        // not extend a session or an OAuth challenge without the local key.
        const encrypted = sealEphemeral(changed.entry, hash);
        const expires = new Date(changed.entry.expires);
        await tx.$executeRaw`INSERT INTO postiz_private.ephemeral (key_hash, value, expires_at)
          VALUES (${hash}, ${encrypted}, ${expires}) ON CONFLICT (key_hash)
          DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
      } else {
        await tx.$executeRaw`DELETE FROM postiz_private.ephemeral WHERE key_hash = ${hash}`;
      }
      return changed.result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 });
  }

  async get(key: string): Promise<string | null> {
    return this.change(key, entry => {
      if (entry && typeof entry.value !== 'string') throw new Error('Unexpected ephemeral value type');
      return { entry, result: entry ? entry.value as string : null };
    });
  }
  async getdel(key: string): Promise<string | null> {
    return this.change(key, entry => {
      if (entry && typeof entry.value !== 'string') throw new Error('Unexpected ephemeral value type');
      return { entry: null, result: entry ? entry.value as string : null };
    });
  }
  async set(key: string, value: string, mode: string, seconds: number, condition?: string): Promise<'OK' | null> {
    if (typeof value !== 'string' || mode !== 'EX' || !Number.isSafeInteger(seconds) || seconds <= 0 ||
        seconds > 86400 || (condition !== undefined && condition !== 'NX')) throw new Error('Unsupported ephemeral SET');
    return this.change(key, (entry, now) => entry && condition === 'NX'
      ? { entry, result: null } : { entry: { value, expires: now + seconds * 1000 }, result: 'OK' });
  }
  async del(key: string): Promise<number> {
    return this.change(key, entry => ({ entry: null, result: entry ? 1 : 0 }));
  }
  async rpush(key: string, value: string): Promise<number> {
    return this.change(key, (entry, now) => {
      if (entry && !Array.isArray(entry.value)) throw new Error('Unexpected ephemeral value type');
      const list = [...((entry?.value as string[]) || []), value];
      if (list.length > 10000) throw new Error('Ephemeral list limit exceeded');
      return { entry: { value: list, expires: entry?.expires || now + 3600000 }, result: list.length };
    });
  }
  async lrange(key: string, start: number, end: number): Promise<string[]> {
    return this.change(key, entry => {
      if (entry && !Array.isArray(entry.value)) throw new Error('Unexpected ephemeral value type');
      const list = (entry?.value as string[]) || [];
      const first = start < 0 ? Math.max(0, list.length + start) : start;
      const last = end < 0 ? list.length + end : end;
      return { entry, result: last < first ? [] : list.slice(first, last + 1) };
    });
  }
  async expire(key: string, seconds: number): Promise<number> {
    if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 86400) throw new Error('Invalid ephemeral expiry');
    return this.change(key, (entry, now) => ({ entry: entry ? { ...entry, expires: now + seconds * 1000 } : null, result: entry ? 1 : 0 }));
  }
  async increment(key: string, ttl: number, limit: number, blockDuration: number, name: string) {
    return this.change(`throttle:${name}:${key}`, (entry, now) => {
      let state = entry?.value as { hits: number; until: number; blockedUntil: number };
      if (!state || (state.blockedUntil ? state.blockedUntil <= now : state.until <= now)) {
        state = { hits: 0, until: now + ttl, blockedUntil: 0 };
      }
      if (!state.blockedUntil) {
        state.hits++;
        if (state.hits > limit) state.blockedUntil = now + blockDuration;
      }
      return { entry: { value: state, expires: Math.max(state.until, state.blockedUntil) }, result: {
        totalHits: state.hits, timeToExpire: Math.max(0, Math.ceil((state.until - now) / 1000)),
        isBlocked: state.blockedUntil > now, timeToBlockExpire: Math.max(0, Math.ceil((state.blockedUntil - now) / 1000)),
      } };
    });
  }
  async cleanupExpired() {
    return this.database().$executeRaw`DELETE FROM postiz_private.ephemeral WHERE expires_at <= clock_timestamp()`;
  }
  async onApplicationShutdown() { await this.client?.$disconnect(); }
}

export const postgresEphemeralStore = new PostgresEphemeralStore();
