import { Payload, PayloadCodec, DataConverter } from '@temporalio/common';
// Keep this runtime-resolved module in TypeScript's production build graph.
import './local-failure-converter';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const encoding = 'binary/postiz-encrypted-v1';
function key() {
  const master = process.env.LOCAL_TOKEN_KEY || '';
  if (!/^[a-f0-9]{64}$/.test(master)) throw new Error('Temporal encryption key required');
  return createHmac('sha256', Buffer.from(master, 'hex')).update('postiz/temporal/key/v1').digest();
}
export class LocalPayloadCodec implements PayloadCodec {
  async encode(payloads: Payload[]): Promise<Payload[]> {
    return payloads.map(payload => {
      const body = JSON.stringify({
        metadata: Object.fromEntries(Object.entries(payload.metadata || {}).map(([name, bytes]) => [name, Buffer.from(bytes).toString('base64')])),
        data: payload.data == null ? null : Buffer.from(payload.data).toString('base64'),
      });
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key(), iv);
      cipher.setAAD(Buffer.from(encoding));
      const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
      return { metadata: { encoding: Buffer.from(encoding) }, data: Buffer.concat([iv, cipher.getAuthTag(), encrypted]) };
    });
  }
  async decode(payloads: Payload[]): Promise<Payload[]> {
    return payloads.map(payload => {
      if (Buffer.from(payload.metadata?.encoding || []).toString() !== encoding) throw new Error('Unencrypted Temporal payload rejected');
      const bytes = Buffer.from(payload.data || []);
      if (bytes.length < 29) throw new Error('Invalid encrypted Temporal payload');
      const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(encoding));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
      return { metadata: Object.fromEntries(Object.entries(value.metadata).map(([name, bytes]) => [name, Buffer.from(bytes as string, 'base64')])),
        ...(value.data === null ? {} : { data: Buffer.from(value.data, 'base64') }) };
    });
  }
}
export function localTemporalDataConverter(): DataConverter {
  return { payloadCodecs: [new LocalPayloadCodec()], failureConverterPath: require.resolve('./local-failure-converter') };
}
