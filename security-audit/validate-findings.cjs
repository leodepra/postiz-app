/* Offline checks of the checked-out source. Node >=22.13 required.
 * No application startup, network requests, real users, secrets or database writes.
 * These are evidence checks for the audit, not end-to-end penetration tests.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const results = [];
function compile(source, context = {}) {
  return vm.runInNewContext(stripTypeScriptTypes(source), context);
}
function between(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `Missing source marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to >= 0, `Missing end marker: ${end}`);
  return source.slice(from, to);
}
async function main() {
  // Verify the real middleware's decisions after successful signature verification.
  // JWT crypto and database are mocked; the authorization method is actual source.
  const middleware = read('apps/backend/src/services/auth/auth.middleware.ts');
  const method = middleware.slice(middleware.indexOf('  async use('), middleware.lastIndexOf('\n}'));
  const expiredResetPayload = { id: 'audit-user', expires: '2000-01-01 00:00:00' };
  const use = compile('(' + method.replace('async use(', 'async function(') + ')', {
    AuthService: { verifyJWT: () => expiredResetPayload },
    HttpForbiddenException: Error,
    setSentryUserContext: () => {},
  });
  const req = { headers: { auth: 'verified-fixture' }, cookies: {} };
  let nextCalled = false;
  await use.call({
    _userService: { getUserById: async () => ({ id: 'audit-user', activated: true }) },
    _organizationService: { getOrgsByUserId: async () => [
      { id: 'audit-org', apiKey: 'fixture', users: [{ disabled: false }] },
    ] },
  }, req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  results.push({ check: 'AUTH-RESET', observed: 'Middleware accepts verified password-reset payload with expired custom expires field', boundary: 'JWT signature verification and database mocked; actual middleware executed' });

  const guard = read('libraries/nestjs-libraries/src/throttler/throttler.provider.ts');
  const canActivate = between(guard, '  public override async canActivate(', '\n  protected override async getTracker');
  let throttleCalls = 0;
  const instance = compile('new (class extends Base { ' + canActivate + ' })()', {
    Base: class { async canActivate() { throttleCalls++; return true; } },
    isPublicComment: (method, url) => method === 'POST' && /^\/public\/posts\/[^/]+\/comments/.test(url),
  });
  for (const url of ['/auth/login', '/auth/forgot', '/auth/register']) {
    await instance.canActivate({ switchToHttp: () => ({ getRequest: () => ({ url, method: 'POST' }) }) });
  }
  assert.equal(throttleCalls, 0);
  results.push({ check: 'AUTH-RATE', observed: 'Global guard does not invoke limiter for login, reset request or registration', boundary: 'Actual guard method; Nest context and parent limiter mocked' });

  const controller = read('apps/backend/src/api/routes/public.controller.ts');
  let stream = controller.slice(controller.indexOf('  async streamFile('), controller.lastIndexOf('\n}'));
  stream = stream.replace(/@Query\(\)\s*/g, '').replace(/@Res\(\)\s*/g, '').replace(/@Req\(\)\s*/g, '');
  const html = '<!doctype html><script>document.title="audit-marker"</script>';
  const streamFile = compile('(' + stream.replace('async streamFile(', 'async function(') + ')', {
    AbortController, Readable, pump: pipeline,
    isSafePublicHttpsUrl: async url => url === 'https://audit.example/video.mp4',
    ssrfSafeDispatcher: {},
    fetch: async () => new Response(html, { headers: { 'content-type': 'text/html' } }),
  });
  const headers = {};
  const chunks = [];
  const res = new Writable({ write(chunk, enc, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  res.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
  res.status = () => res;
  res.send = value => { throw new Error('Unexpected rejection: ' + value); };
  await streamFile({ url: 'https://audit.example/video.mp4' }, res, { on() {} });
  assert.equal(headers['content-type'], 'text/html');
  assert.equal(Buffer.concat(chunks).toString(), html);
  assert.equal(headers['content-security-policy'], undefined);
  assert.equal(headers['content-disposition'], undefined);
  results.push({ check: 'STREAM-HTML', observed: 'Public video handler forwards HTML and script unchanged with text/html, without sandbox CSP or attachment header', boundary: 'Actual handler and real stream pipeline; upstream response and URL validation mocked; browser execution not tested' });

  const validator = read('libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts');
  const ipSource = between(validator, 'export function isBlockedIPv4', '@ValidatorConstraint').replace(/export /g, '');
  const checks = compile('(() => { ' + ipSource + '; return { isBlockedIp, isSafePublicHttpsUrl }; })()', { net, URL });
  assert.equal(checks.isBlockedIp('127.0.0.1'), true);
  const normalized = new URL('https://[::ffff:127.0.0.1]/').hostname.replace(/^\[|\]$/g, '');
  assert.equal(normalized, '::ffff:7f00:1');
  assert.equal(checks.isBlockedIp(normalized), false);
  assert.equal(await checks.isSafePublicHttpsUrl('https://[::ffff:127.0.0.1]/'), true);
  results.push({ check: 'SSRF-IPV6', observed: 'IPv4-mapped loopback normalized to hexadecimal passes public HTTPS URL validator', boundary: 'Actual validation functions executed; no connection to internal services attempted; TLS/transport reachability remains deployment dependent' });

  const auth = read('apps/backend/src/api/routes/auth.controller.ts');
  const cookie = between(auth, "      response.cookie('auth', jwt, {", '\n      });').replace("      response.cookie('auth', jwt, ", '');
  const cookieOptions = compile('(' + cookie + '})', {
    process: { env: { NOT_SECURED: 'false', FRONTEND_URL: 'https://audit.example' } },
    getCookieUrlFromDomain: () => 'audit.example', Date,
  });
  assert.equal(cookieOptions.httpOnly, undefined);
  assert.equal(cookieOptions.secure, undefined);
  results.push({ check: 'CONFIG-FALSE', observed: 'NOT_SECURED="false" omits Secure and HttpOnly cookie flags', boundary: 'Actual cookie options expression evaluated using fixture environment' });
  console.log(JSON.stringify({ mode: 'offline isolated source checks', node: process.version, passed: results.length, results }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
