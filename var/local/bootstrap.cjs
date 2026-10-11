'use strict';
const fs = require('node:fs');
const { Agent, ProxyAgent, setGlobalDispatcher } = require('undici');
// This file is preloaded before any module can initialize telemetry or SDKs.
if (process.env.POSTIZ_LOCAL_ONLY !== 'true') throw new Error('Local bootstrap requires local profile');
const secrets = JSON.parse(fs.readFileSync('/run/secrets/local_config', 'utf8'));
for (const key of ['JWT_SECRET','LOCAL_INTERNAL_SECRET','LOCAL_TOKEN_KEY','DATABASE_URL','REDIS_URL']) {
  if (typeof secrets[key] !== 'string' || !secrets[key]) throw new Error('Missing local secret: ' + key);
  process.env[key] = secrets[key];
}
// Optional YouTube credentials belong to this installation's own Google app.
for (const key of ['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET']) if (secrets[key]) process.env[key] = secrets[key];
for (const key of Object.keys(process.env)) {
  if (/SENTRY|POSTHOG|PLAUSIBLE|STRIPE|OPENAI|ANTHROPIC|RESEND|MAILGUN|SENDGRID|CHATBASE|INTERCOM|CLOUDFLARE|RUNPOD|DEEPGRAM|GTM|TAG_MANAGER|DISCORD|SLACK|MCP|DATAFAST|FACEBOOK_PIXEL|RECAPTCHA|TRANSLOADIT|POLOTNO|EMAIL_PROVIDER|SMTP/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  STORAGE_PROVIDER: 'local', UPLOAD_DIRECTORY: '/uploads', NOT_SECURED: 'false',
  DISABLE_REGISTRATION: 'true', DISABLE_SSRF_PROTECTION: 'false', NEXT_TELEMETRY_DISABLED: '1',
  FRONTEND_URL: 'https://localhost:7443', NEXT_PUBLIC_BACKEND_URL: 'https://localhost:7443/api',
  BACKEND_INTERNAL_URL: 'http://127.0.0.1:3000', TEMPORAL_ADDRESS: '172.30.251.13:7233',
  HTTP_PROXY: 'http://172.30.251.14:3128', HTTPS_PROXY: 'http://172.30.251.14:3128',
  NO_PROXY: '127.0.0.1,localhost',
});
const proxy = new ProxyAgent(process.env.HTTPS_PROXY);
const internal = new Agent();
setGlobalDispatcher({
  dispatch(options, handler) {
    const url = new URL(options.origin);
    return (url.origin === 'http://127.0.0.1:3000' ? internal : proxy).dispatch(options, handler);
  },
  close: () => Promise.all([proxy.close(), internal.close()]),
  destroy: () => Promise.all([proxy.destroy(), internal.destroy()]),
});
