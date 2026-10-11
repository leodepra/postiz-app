import { createHash, randomBytes } from 'node:crypto';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

// Opaque sessions intentionally cannot be confused with JWT reset/invite tokens.
export const LOCAL_SESSION_TTL = 30 * 60;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sessionKey = (token: string) => `local:session:${digest(token)}`;

export class LocalSessions {
  constructor(private store: Pick<typeof ioRedis, 'get' | 'set' | 'del'> = ioRedis) {}

  fingerprint(token: unknown): string {
    if (typeof token !== 'string' || !/^ls_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid session');
    return digest(token);
  }

  async create(user: { id: string; password?: string | null }) {
    const token = 'ls_' + randomBytes(32).toString('base64url');
    await this.store.set(sessionKey(token), JSON.stringify({ id: user.id, passwordVersion: digest(user.password || '') }), 'EX', LOCAL_SESSION_TTL);
    return token;
  }

  async read(token: unknown) {
    if (typeof token !== 'string' || !/^ls_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid session');
    const record = await this.store.get(sessionKey(token));
    if (!record) throw new Error('Session expired or revoked');
    const session = JSON.parse(record) as { id: string; passwordVersion: string };
    if (!session.id || !session.passwordVersion) throw new Error('Invalid session');
    return session;
  }

  matchesPassword(session: { passwordVersion: string }, user: { password?: string | null }) {
    return session.passwordVersion === digest(user.password || '');
  }

  async revoke(token: unknown) {
    if (typeof token === 'string') await this.store.del(sessionKey(token));
  }
}

export const localSessions = new LocalSessions();
