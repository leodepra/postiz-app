/** Validate without including credentials in error messages. */
export function validateSupabaseDatabase(raw = process.env.DATABASE_URL): URL {
  let url: URL;
  try { url = new URL(raw || ''); } catch { throw new Error('Supabase database configuration required'); }
  const host = process.env.POSTIZ_DATABASE_HOST || '';
  const officialHost = /^(?:db\.[a-z0-9]+\.supabase\.co|aws-[a-z0-9-]+\.pooler\.supabase\.com)$/;
  if (!officialHost.test(host) || url.hostname !== host || url.port !== '5432' ||
      !['postgresql:', 'postgres:'].includes(url.protocol) || !url.username || !url.password ||
      url.pathname !== '/postgres' || url.hash) {
    throw new Error('Expected the approved Supabase direct or session-pooler database endpoint');
  }
  const params = url.searchParams;
  const allowed = new Set(['sslmode', 'sslaccept', 'sslcert', 'schema', 'connection_limit', 'connect_timeout', 'pool_timeout']);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error('Unsupported database connection option');
  }
  if (params.get('sslmode') !== 'require' || params.get('sslaccept') !== 'strict' || params.get('schema') !== 'postiz') {
    throw new Error('Supabase requires verified TLS and the private postiz schema');
  }
  if (decodeURIComponent(url.username).split('.')[0] !== 'postiz_app') {
    throw new Error('Use the restricted postiz_app database role, not an administrator');
  }
  return url;
}
