import { validateSupabaseDatabase } from './supabase-database';
/** Local application with an explicitly approved Supabase database. */
export const isLocalProfile = () => process.env.POSTIZ_LOCAL_ONLY === 'true';

export function localOrigin(): URL {
  const url = new URL(process.env.FRONTEND_URL || '');
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.port !== '7443' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Local profile requires the fixed HTTP localhost origin');
  }
  return url;
}

export function validateLocalProfile() {
  if (!isLocalProfile()) return;
  localOrigin();
  validateSupabaseDatabase();
  for (const name of ['JWT_SECRET', 'LOCAL_INTERNAL_SECRET', 'LOCAL_TOKEN_KEY']) {
    if (!/^[a-f0-9]{64}$/.test(process.env[name] || '')) {
      throw new Error(`Local profile requires a generated 256-bit ${name}`);
    }
  }
  if (new Set(['JWT_SECRET', 'LOCAL_INTERNAL_SECRET', 'LOCAL_TOKEN_KEY'].map(k => process.env[k])).size !== 3) {
    throw new Error('Local profile keys must have distinct purposes');
  }
  if (process.env.STORAGE_PROVIDER !== 'local' || process.env.NOT_SECURED === 'true' || process.env.DISABLE_SSRF_PROTECTION === 'true' || process.env.REDIS_URL) {
    throw new Error('Unsafe local profile configuration');
  }
  if (process.env.DISABLE_REGISTRATION !== 'true') {
    throw new Error('Local profile requires registration disabled; use the local account command');
  }
}
