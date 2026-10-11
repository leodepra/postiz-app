// Full gateway smoke test with no publisher worker or real social account.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const privateDir = path.join(root, 'local-data/secrets');
const diagnosticDir = path.join(privateDir, 'diagnostics');
const node = path.join(root, 'local-data/runtime/node-v22.23.3-win-x64/node.exe');
const children = [];
const handles = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function listening(port) { return new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.setTimeout(500);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  socket.once('timeout', () => { socket.destroy(); resolve(false); });
}); }
function start(executable, args, role, extraEnv = {}) {
  const fd = fs.openSync(path.join(diagnosticDir, role + '.log'), 'w'); handles.push(fd);
  const child = spawn(executable, args, { cwd: root, windowsHide: true,
    env: { ...process.env, ...extraEnv }, stdio: ['ignore', fd, fd] });
  children.push(child); return child;
}
async function waitPort(port, child, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (child.exitCode !== null) throw new Error('Process failed: ' + port);
    if (await listening(port)) return;
    await pause(1000);
  }
  throw new Error('Process timed out: ' + port);
}
function get(pathname, host = 'localhost:7443') { return new Promise((resolve, reject) => {
  const req = http.get({ hostname: 'localhost', port: 7443, path: pathname,
    family: 4,
    headers: { Host: host } }, res => {
    const chunks = []; res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString(), headers: res.headers }));
  });
  req.setTimeout(20000, () => req.destroy(new Error('HTTP request timed out')));
  req.on('error', reject);
}); }
(async () => {
  for (const port of [3001, 3128, 4200, 7233, 7443]) if (await listening(port)) throw new Error('Port already occupied: ' + port);
  fs.mkdirSync(diagnosticDir, { recursive: true });
  const temporal = start(path.join(root, 'local-data/runtime/temporal/temporal.exe'),
    ['server', 'start-dev', '--ip', '127.0.0.1', '--port', '7233', '--headless', '--namespace', 'postiz-local'], 'https-temporal');
  await waitPort(7233, temporal, 40);
  const egress = start(node, ['var/local/egress.cjs'], 'https-egress'); await waitPort(3128, egress, 20);
  const backend = start(node, ['--require', './var/local/windows/bootstrap.cjs', 'apps/backend/dist/apps/backend/src/main.js'], 'https-backend', { POSTIZ_PROCESS_ROLE: 'backend' });
  await waitPort(3001, backend, 300);
  const frontend = start(node, ['--require', './var/local/windows/bootstrap.cjs', 'node_modules/next/dist/bin/next', 'start', 'apps/frontend', '-H', '127.0.0.1', '-p', '4200'], 'https-frontend', { POSTIZ_PROCESS_ROLE: 'frontend' });
  await waitPort(4200, frontend, 90);
  const caddy = start(path.join(root, 'local-data/runtime/caddy/caddy.exe'), ['run', '--config', 'var/local/windows/Caddyfile', '--adapter', 'caddyfile'], 'https-caddy');
  await waitPort(7443, caddy, 40);
  const login = await get('/auth/login');
  const register = await get('/api/auth/can-register');
  const media = await get('/uploads/2026/10/11/aaaaaaaaaaaaaaaa.png');
  if (login.status !== 200 || !login.body.includes('<html') || register.status !== 200 ||
      !register.body.includes('false') || ![401, 403, 404].includes(media.status)) {
    throw new Error(`Unexpected HTTP responses: login=${login.status} register=${register.status} media=${media.status}`);
  }
  console.log(JSON.stringify({ httpLoopback: true, login: login.status, registrationDisabled: true,
    unauthenticatedMedia: media.status, workerStarted: false }));
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => { for (const child of children.reverse()) child.kill(); for (const fd of handles) fs.closeSync(fd); });
