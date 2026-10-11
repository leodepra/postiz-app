import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const prefix = 'postiz:v1:';
function key() {
  const value = process.env.LOCAL_TOKEN_KEY || '';
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid local token key');
  return Buffer.from(value, 'hex');
}

export function encryptLocalToken(value: string): string {
  if (!value) return value;
  // Do not accept client-supplied ciphertext as an instruction to skip encryption.
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from('postiz/integration/v1'));
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return prefix + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function decryptLocalToken(value: string): string {
  if (!value) return value;
  if (!value.startsWith(prefix)) throw new Error('Unencrypted integration token: migrate before enabling the local profile');
  const bytes = Buffer.from(value.slice(prefix.length), 'base64url');
  if (bytes.length < 29) throw new Error('Invalid encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from('postiz/integration/v1'));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

export function decryptTokenFields<T>(value: T): T {
  if (value === null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(decryptTokenFields) as T;
  const result: any = { ...value };
  for (const [name, entry] of Object.entries(result)) {
    if (typeof entry === 'string' && entry.startsWith(prefix) && ['token', 'refreshToken'].includes(name)) {
      result[name] = decryptLocalToken(entry);
    } else if (entry && typeof entry === 'object') {
      result[name] = decryptTokenFields(entry);
    }
  }
  return result;
}
