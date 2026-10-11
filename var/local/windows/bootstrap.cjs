'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const role = process.env.POSTIZ_PROCESS_ROLE;
if (!['backend', 'worker', 'frontend', 'account', 'build'].includes(role)) throw new Error('Explicit local process role required');
const secrets = role === 'build' ? {} : JSON.parse(fs.readFileSync(path.join(root, 'local-data/secrets',
  role === 'frontend' ? 'frontend-config.json' : 'windows-config.json'), 'utf8'));
// Start from a small Windows process environment so secrets from other
// projects cannot accidentally enter this application or a browser bundle.
const inherited = new Set([
  'SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATH', 'PATHEXT',
  'TEMP', 'TMP', 'USERPROFILE', 'USERNAME', 'USERDOMAIN', 'HOMEDRIVE',
  'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES',
  'PROGRAMFILES(X86)', 'COMMONPROGRAMFILES', 'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS', 'POSTIZ_PROCESS_ROLE',
]);
for (const name of Object.keys(process.env)) {
  if (!inherited.has(name.toUpperCase())) delete process.env[name];
}
const names = role === 'frontend' ? ['LOCAL_INTERNAL_SECRET'] : role === 'build' ? [] :
  ['JWT_SECRET', 'LOCAL_INTERNAL_SECRET', 'LOCAL_TOKEN_KEY', 'DATABASE_URL', 'POSTIZ_DATABASE_HOST', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'];
for (const name of names) if (secrets[name]) process.env[name] = secrets[name];
Object.assign(process.env, {
  NODE_ENV: 'production', POSTIZ_LOCAL_ONLY: 'true', NEXT_TELEMETRY_DISABLED: '1',
  STORAGE_PROVIDER: 'local', UPLOAD_DIRECTORY: path.join(root, 'local-data/uploads'),
  NOT_SECURED: 'false', DISABLE_REGISTRATION: 'true', DISABLE_SSRF_PROTECTION: 'false',
  FRONTEND_URL: 'http://localhost:7443', MAIN_URL: 'http://localhost:7443',
  NEXT_PUBLIC_BACKEND_URL: 'http://localhost:7443/api', BACKEND_INTERNAL_URL: 'http://127.0.0.1:3001',
  ...(role === 'backend' ? { PORT: '3001' } : {}),
  TEMPORAL_ADDRESS: '127.0.0.1:7233', TEMPORAL_NAMESPACE: 'postiz-local',
  ORCHESTRATOR_PORT: '3002',
  HTTP_PROXY: 'http://127.0.0.1:3128', HTTPS_PROXY: 'http://127.0.0.1:3128', NO_PROXY: '127.0.0.1,localhost',
});
const { Agent, ProxyAgent, setGlobalDispatcher } = require('undici');
const proxy = new ProxyAgent(process.env.HTTPS_PROXY);
const internal = new Agent();
setGlobalDispatcher({
  dispatch(options, handler) {
    const url = new URL(options.origin);
    return (url.origin === 'http://127.0.0.1:3001' ? internal : proxy).dispatch(options, handler);
  },
  close: () => Promise.all([proxy.close(), internal.close()]),
  destroy: () => Promise.all([proxy.destroy(), internal.destroy()]),
});
