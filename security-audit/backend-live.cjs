// Starts only the API and a temporary Temporal server. No publishing worker.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const children = [], logs = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function start(executable, args, name, env = process.env) {
  const fd = fs.openSync(path.join(root, 'local-data/secrets/diagnostics', name + '.log'), 'w');
  logs.push(fd);
  const child = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd] });
  children.push(child); return child;
}
function isListening(port) { return new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.setTimeout(500); socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false); });
}); }
function request(urlPath, headers) { return new Promise((resolve, reject) => {
  const request = http.get({ hostname: '127.0.0.1', port: 3001, path: urlPath, headers }, response => {
    response.resume(); response.once('end', () => resolve(response.statusCode));
  }); request.on('error', reject); request.setTimeout(10000, () => request.destroy(new Error('Request timeout')));
}); }
(async () => {
  for (const port of [3001, 3128, 7233]) if (await isListening(port)) throw new Error('Test port already occupied: ' + port);
  fs.mkdirSync(path.join(root, 'local-data/secrets/diagnostics'), { recursive: true });
  start(path.join(root, 'local-data/runtime/temporal/temporal.exe'),
    ['server', 'start-dev', '--ip', '127.0.0.1', '--port', '7233', '--headless', '--namespace', 'postiz-local'], 'temporal');
  start(process.execPath, ['var/local/egress.cjs'], 'egress');
  const backend = start(process.execPath, ['--require', './security-audit/trace-startup.cjs', '--require', './var/local/windows/bootstrap.cjs',
    'apps/backend/dist/apps/backend/src/main.js'], 'backend', { ...process.env, POSTIZ_PROCESS_ROLE: 'backend' });
  for (let i = 0; i < 300; i++) {
    if (backend.exitCode !== null) throw new Error('Backend startup failed; protected diagnostic log available');
    if (await isListening(3001)) {
      const unauthenticated = await request('/user/self', { Host: 'localhost:7443' });
      const invalidHost = await request('/user/self', { Host: 'unexpected.invalid' });
      if (![401, 403].includes(unauthenticated) || invalidHost !== 403) throw new Error('Unexpected local security response');
      console.log(JSON.stringify({ started: true, unauthenticated, invalidHost, workerStarted: false })); return;
    }
    await delay(1000);
  }
  throw new Error('Backend startup timed out; protected diagnostic log available');
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => { for (const child of children.reverse()) child.kill(); for (const fd of logs) fs.closeSync(fd); });
