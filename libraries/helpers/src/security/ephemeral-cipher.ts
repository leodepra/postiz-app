import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

function key() {
  const master = process.env.LOCAL_TOKEN_KEY || '';
  if (!/^[a-f0-9]{64}$/.test(master)) throw new Error('Invalid local encryption key');
  return createHmac('sha256', Buffer.from(master, 'hex')).update('postiz/ephemeral/key/v1').digest();
}
export function sealEphemeral(value: unknown, keyHash: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`postiz/ephemeral/v1/${keyHash}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return 'ephemeral:v1:' + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
export function openEphemeral(value: string, keyHash: string): unknown {
  if (!value.startsWith('ephemeral:v1:')) throw new Error('Invalid encrypted ephemeral value');
  const bytes = Buffer.from(value.slice('ephemeral:v1:'.length), 'base64url');
  if (bytes.length < 29) throw new Error('Invalid encrypted ephemeral value');
  const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(`postiz/ephemeral/v1/${keyHash}`));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}
