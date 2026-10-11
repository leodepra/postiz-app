require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
// No real Redis connection is made by the test suite.
delete process.env.REDIS_URL;
const { LocalSessions, LOCAL_SESSION_TTL } = require('../../libraries/nestjs-libraries/src/security/local-session.ts');
const { encryptLocalToken, decryptLocalToken, decryptTokenFields } = require('../../libraries/helpers/src/security/token-cipher.ts');
const { resolveLocalMedia } = require('../../libraries/helpers/src/security/local-media.ts');
const { isBlockedIp, isSafePublicHttpsUrl } = require('../../libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts');
const { localSecurity } = require('../../apps/backend/src/services/auth/local-security.middleware.ts');
const { validateLocalProfile } = require('../../libraries/helpers/src/security/local-profile.ts');
const { getCookieUrlFromDomain } = require('../../libraries/helpers/src/subdomain/subdomain.management.ts');

function config() {
  Object.assign(process.env, {
    POSTIZ_LOCAL_ONLY: 'true', FRONTEND_URL: 'http://localhost:7443',
    JWT_SECRET: 'a'.repeat(64), LOCAL_INTERNAL_SECRET: 'b'.repeat(64), LOCAL_TOKEN_KEY: 'c'.repeat(64),
    STORAGE_PROVIDER: 'local', NOT_SECURED: 'false', DISABLE_SSRF_PROTECTION: 'false',
    DISABLE_REGISTRATION: 'true',
    POSTIZ_DATABASE_HOST: 'db.example.supabase.co',
    DATABASE_URL: 'postgresql://postiz_app:fake-test-password@db.example.supabase.co:5432/postgres?schema=postiz&sslmode=require&sslaccept=strict',
  });
  delete process.env.REDIS_URL;
}

test('opaque sessions expire, revoke and invalidate on password changes; JWTs cannot authenticate', async () => {
  let now = 0;
  const data = new Map();
  const sessions = new LocalSessions({
    async set(key, value, flag, ttl) {
      assert.equal(flag, 'EX'); assert.equal(ttl, LOCAL_SESSION_TTL);
      data.set(key, { value, end: now + ttl });
    },
    async get(key) { const entry = data.get(key); return entry && entry.end > now ? entry.value : null; },
    async del(key) { data.delete(key); },
  });
  const user = { id: 'local-user', password: 'stored-password-hash' };
  const token = await sessions.create(user);
  assert.match(token, /^ls_[\w-]{43}$/);
  assert.ok(![...data.keys()].some(key => key.includes(token)));
  const record = await sessions.read(token);
  assert.equal(record.id, user.id);
  assert.equal(sessions.matchesPassword(record, user), true);
  assert.equal(sessions.matchesPassword(record, { password: 'new-hash' }), false);
  for (const bad of ['eyJhbGciOiJIUzI1NiJ9.reset.signature', '', null, token + 'x']) await assert.rejects(sessions.read(bad));
  await sessions.revoke(token); await assert.rejects(sessions.read(token));
  const second = await sessions.create(user); now += LOCAL_SESSION_TTL;
  await assert.rejects(sessions.read(second));
});

test('integration AEAD is randomized and rejects tampering, wrong key and plaintext', () => {
  config();
  const secret = 'fake-google-token';
  const a = encryptLocalToken(secret), b = encryptLocalToken(secret);
  assert.notEqual(a, b); assert.ok(!a.includes(secret));
  assert.equal(decryptLocalToken(a), secret);
  assert.deepEqual(decryptTokenFields({ integration: { token: a, refreshToken: b } }), { integration: { token: secret, refreshToken: secret } });
  const bytes = Buffer.from(a.split(':')[2], 'base64url'); bytes[14] ^= 1;
  assert.throws(() => decryptLocalToken('postiz:v1:' + bytes.toString('base64url')));
  process.env.LOCAL_TOKEN_KEY = randomBytes(32).toString('hex');
  assert.throws(() => decryptLocalToken(a)); assert.throws(() => decryptLocalToken(secret));
  config();
});

test('Prisma middleware encrypts creates, upserts, bulk writes and set updates without mutating input', async () => {
  config();
  const { integrationCipherMiddleware } = require('../../libraries/helpers/src/security/integration-cipher-middleware.ts');
  for (const action of ['create', 'update', 'updateMany', 'createMany', 'upsert']) {
    const record = { token: 'fake-access', refreshToken: 'fake-refresh' };
    const args = action === 'upsert' ? { create: record, update: { token: { set: 'fake-access' } } }
      : { data: action === 'createMany' ? [record] : record };
    const before = JSON.stringify(args);
    const result = await integrationCipherMiddleware({ model: 'Integration', action, args }, async params => {
      const encrypted = action === 'upsert' ? params.args.create : action === 'createMany' ? params.args.data[0] : params.args.data;
      assert.match(encrypted.token, /^postiz:v1:/);
      assert.equal(decryptLocalToken(encrypted.refreshToken), 'fake-refresh');
      if (action === 'upsert') assert.equal(decryptLocalToken(params.args.update.token.set), 'fake-access');
      return encrypted;
    });
    assert.deepEqual(result, record); assert.equal(JSON.stringify(args), before);
  }
});

test('egress proxy rejects unlisted destinations and private DNS results over a real socket', async () => {
  const http = require('node:http');
  const { createProxy, allowedTarget, publicAddress } = require('../../var/local/egress.cjs');
  for (const target of ['localhost:443','www.googleapis.com.evil.test:443','www.googleapis.com:80',
    '127.0.0.1:443','user@www.googleapis.com:443','www.googleapis.com.:443']) assert.equal(allowedTarget(target), false);
  assert.equal(allowedTarget('www.googleapis.com:443'), true);
  assert.equal(publicAddress('::ffff:7f00:1'), false);
  let lookups = 0;
  const proxy = createProxy(async () => { lookups++; return [{ address: '127.0.0.1', family: 4 }]; });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  try {
    for (const destination of ['attacker.test:443', 'www.googleapis.com:443']) {
      const status = await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: proxy.address().port, method: 'CONNECT', path: destination });
        req.on('connect', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
        req.on('error', reject); req.end();
      });
      assert.equal(status, 403);
    }
    assert.equal(lookups, 1, 'unknown names must be rejected before DNS resolution');
  } finally { await new Promise(resolve => proxy.close(resolve)); }
});

test('SSRF dispatcher blocks literal IPs even when DNS lookup would be bypassed', async () => {
  const { request } = require('undici');
  const { ssrfSafeDispatcher } = require('../../libraries/nestjs-libraries/src/dtos/webhooks/ssrf.safe.dispatcher.ts');
  await assert.rejects(request('http://127.0.0.1:65534', { dispatcher: ssrfSafeDispatcher }), /Blocked IP/);
  await assert.rejects(request('http://[::ffff:7f00:1]:65534', { dispatcher: ssrfSafeDispatcher }), /Blocked IP/);
  await ssrfSafeDispatcher.close();
});

test('SSRF blocks mapped IPv6, reserved, private, multicast and malformed addresses', async () => {
  for (const ip of ['127.0.0.1','10.2.3.4','169.254.169.254','100.64.0.1','192.168.1.2','192.0.2.1',
    '198.51.100.1','203.0.113.1','224.0.0.1','::1','::','::ffff:127.0.0.1','::ffff:7f00:1',
    '::ffff:a00:1','fe90::1','fd00::1','2001:db8::1','ff02::1','127.1','garbage']) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111']) assert.equal(isBlockedIp(ip), false, ip);
  for (const url of ['https://[::ffff:7f00:1]/','https://2130706433/','https://0x7f000001/',
    'https://user:password@8.8.8.8/','http://8.8.8.8/','https://8.8.8.8:1234/']) {
    assert.equal(await isSafePublicHttpsUrl(url), false, url);
  }
});

function request(route, method = 'GET', headers = {}) {
  config();
  let status = 200, allowed = false;
  const response = { status(value) { status = value; return this; }, json() {}, sendStatus(value) { status = value; }, setHeader() {} };
  localSecurity({ path: route, method, cookies: {}, headers: { host: 'localhost:7443', ...headers } }, response, () => { allowed = true; });
  return { status, allowed };
}
test('local middleware denies rebinding, cross-origin mutations and unused API surfaces', () => {
  assert.equal(request('/auth/login','POST', { origin: 'http://localhost:7443' }).allowed, true);
  assert.equal(request('/auth/login','POST').status, 403);
  assert.equal(request('/user/self','GET', { host: 'attacker.test' }).status, 403);
  assert.equal(request('/user/self','GET', { origin: 'https://attacker.test' }).status, 403);
  assert.equal(request('/user/self','GET', { auth: 'fake' }).status, 403);
  assert.equal(request('/user/self','GET', { 'sec-fetch-site': 'cross-site' }).status, 403);
  for (const route of ['/public/stream','/webhooks','/mcp','/copilot','/auth/register','/auth/forgot',
    '/user/api-key/rotate','/user/impersonate','/settings/team/add','/posts/generator',
    '/integrations/social/instagram','/integrations/provider/instagram/connect','/integrations/telegram/updates','/media/generate-image']) {
    assert.equal(request(route).status, 404, route);
  }
  assert.equal(request('/media/local-file').allowed, true);
  assert.equal(request('/integrations/social/youtube').allowed, true);
});

test('local configuration fails closed and cookies are host-only', () => {
  config(); validateLocalProfile(); assert.equal(getCookieUrlFromDomain(process.env.FRONTEND_URL), undefined);
  for (const [key, value] of Object.entries({ FRONTEND_URL: 'https://localhost:7443', JWT_SECRET: 'example',
    STORAGE_PROVIDER: 'cloudflare', NOT_SECURED: 'true', DISABLE_SSRF_PROTECTION: 'true', DISABLE_REGISTRATION: 'false' })) {
    config(); process.env[key] = value; assert.throws(validateLocalProfile, key);
  }
  config(); process.env.LOCAL_TOKEN_KEY = process.env.JWT_SECRET; assert.throws(validateLocalProfile); config();
});

test('local media confines reads and rejects external URLs and traversal', () => {
  config();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'postiz-local-test-'));
  try {
    process.env.UPLOAD_DIRECTORY = root;
    const directory = path.join(root,'2026','10','07'); fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory,'abcdef.mp4'); fs.writeFileSync(file, 'fake-video');
    assert.equal(resolveLocalMedia('http://localhost:7443/uploads/2026/10/07/abcdef.mp4'), fs.realpathSync(file));
    for (const url of ['https://example.com/uploads/2026/10/07/abcdef.mp4',
      'http://localhost:7443/uploads/2026/10/07/abcdef.mp4?x=1',
      'http://localhost:7443/uploads/../../secret', 'http://localhost:7443/uploads/2026/10/07/%2e%2e%2fsecret',
      'file:///etc/passwd', file]) assert.throws(() => resolveLocalMedia(url), url);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('postiz-local-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
