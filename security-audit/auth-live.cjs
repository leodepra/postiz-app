// Synthetic local account and HTTP session probe; removes only its own records.
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
process.env.POSTIZ_PROCESS_ROLE = 'account';
require('../var/local/windows/bootstrap.cjs');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const root = path.resolve(__dirname, '..');
const node = path.join(root, 'local-data/runtime/node-v22.23.3-win-x64/node.exe');
const diagnosticDir = path.join(root, 'local-data/secrets/diagnostics');
fs.mkdirSync(diagnosticDir, { recursive: true });
const stateFile = path.join(diagnosticDir, 'auth-probe-state.json');
const db = new PrismaClient();
const children = [], handles = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let userId, organizationId;
function listening(port) { return new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port }); socket.setTimeout(500);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false); });
}); }
function start(executable, args, name, extraEnv = {}) {
  const fd = fs.openSync(path.join(diagnosticDir, name + '.log'), 'w'); handles.push(fd);
  const child = spawn(executable, args, { cwd: root, windowsHide: true,
    env: { ...process.env, ...extraEnv }, stdio: ['ignore', fd, fd] });
  children.push(child); return child;
}
function request(method, pathname, body, cookie) { return new Promise((resolve, reject) => {
  const encoded = body ? Buffer.from(JSON.stringify(body)) : null;
  const req = http.request({ hostname: '127.0.0.1', port: 3001, path: pathname, method,
    headers: { Host: 'localhost:7443', Origin: 'http://localhost:7443',
      ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}),
      ...(cookie ? { Cookie: cookie } : {}) } }, res => {
    const chunks = []; res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
  });
  req.setTimeout(15000, () => req.destroy(new Error('Request timeout')));
  req.on('error', reject); req.end(encoded);
}); }
(async () => {
  for (const port of [3001, 3128, 7233]) if (await listening(port)) throw new Error('Probe port occupied: ' + port);
  const password = randomBytes(24).toString('base64url');
  const email = 'synthetic-' + randomBytes(8).toString('hex') + '@example.invalid';
  const hash = await bcrypt.hash(password, 12);
  const org = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71638294)`;
    if (await tx.user.count() || await tx.organization.count()) throw new Error('Application account already exists; synthetic test skipped');
    return tx.organization.create({ data: {
      name: 'Synthetic security test', apiKey: randomBytes(32).toString('hex'),
      users: { create: { role: 'SUPERADMIN', user: { create: {
        email, password: hash, providerName: 'LOCAL', timezone: 0, activated: true,
        sendSuccessEmails: false, sendFailureEmails: false, sendStreakEmails: false,
      } } } },
    }, include: { users: { include: { user: true } } } });
  });
  organizationId = org.id; userId = org.users[0].user.id;
  fs.writeFileSync(stateFile, JSON.stringify({ organizationId, userId, email }));
  const temporal = start(path.join(root, 'local-data/runtime/temporal/temporal.exe'),
    ['server', 'start-dev', '--ip', '127.0.0.1', '--port', '7233', '--headless', '--namespace', 'postiz-local'], 'auth-temporal');
  const egress = start(node, ['var/local/egress.cjs'], 'auth-egress');
  const backend = start(node, ['--require', './var/local/windows/bootstrap.cjs', 'apps/backend/dist/apps/backend/src/main.js'],
    'auth-backend', { POSTIZ_PROCESS_ROLE: 'backend' });
  let ready = false;
  for (let i = 0; i < 300; i++) {
    if ([temporal, egress, backend].some(child => child.exitCode !== null)) throw new Error('Synthetic service failed');
    if (await listening(3001)) { ready = true; break; }
    await delay(1000);
  }
  if (!ready) throw new Error('Synthetic backend startup timed out');
  const wrong = await request('POST', '/auth/login', { email, password: 'incorrect', provider: 'LOCAL' });
  if (wrong.status !== 400 || wrong.headers['set-cookie']) throw new Error('Wrong password accepted');
  const good = await request('POST', '/auth/login', { email, password, provider: 'LOCAL' });
  const authCookie = (good.headers['set-cookie'] || []).find(value => value.startsWith('auth='));
  if (good.status !== 200 || !authCookie || !/httponly/i.test(authCookie) ||
      !/samesite=lax/i.test(authCookie) || /(?:^|;)\s*(?:secure|domain)=?/i.test(authCookie)) throw new Error('Local login cookie failed');
  const cookie = authCookie.split(';')[0];
  const self = await request('GET', '/user/self', null, cookie);
  if (self.status !== 200) throw new Error('Authenticated session failed');
  const logout = await request('POST', '/user/logout', {}, cookie);
  if (logout.status !== 200) throw new Error('Local logout failed');
  const revoked = await request('GET', '/user/self', null, cookie);
  if (![401, 403].includes(revoked.status)) throw new Error('Revoked session still works');
  console.log(JSON.stringify({ wrongPassword: wrong.status, login: good.status,
    authenticated: self.status, logout: logout.status, revoked: revoked.status }));
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => {
    for (const child of children.reverse()) child.kill();
    for (const fd of handles) fs.closeSync(fd);
    try {
      if (userId && organizationId) {
        await db.$transaction(async tx => {
          await tx.userOrganization.deleteMany({ where: { userId, organizationId } });
          await tx.user.delete({ where: { id: userId } });
          await tx.organization.delete({ where: { id: organizationId } });
        });
        fs.unlinkSync(stateFile);
      }
    } catch { console.error('Synthetic account cleanup needs review; protected state file kept'); process.exitCode = 1; }
    await db.$disconnect();
  });
