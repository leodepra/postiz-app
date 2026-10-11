// Windows native foreground supervisor. Ctrl+C stops only processes started here.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const root = path.resolve(__dirname, '../../..');
const node = path.join(root, 'local-data/runtime/node-v22.23.3-win-x64/node.exe');
const temporal = path.join(root, 'local-data/runtime/temporal/temporal.exe');
const caddy = path.join(root, 'local-data/runtime/caddy/caddy.exe');
const stateDir = path.join(root, 'local-data/secrets');
const logsDir = path.join(stateDir, 'logs');
const children = [];
const handles = [];
let stopping = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function listening(port) { return new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port }); socket.setTimeout(700);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
  socket.once('timeout', () => { socket.destroy(); resolve(false); });
}); }
function start(name, executable, args, role) {
  const fd = fs.openSync(path.join(logsDir, name + '.log'), 'a'); handles.push(fd);
  const child = spawn(executable, args, { cwd: root, windowsHide: true,
    env: { ...process.env, ...(role ? { POSTIZ_PROCESS_ROLE: role } : {}) },
    stdio: ['ignore', fd, fd] });
  children.push({ name, child });
  child.once('exit', (code, signal) => {
    if (!stopping) { console.error(name + ' stopped unexpectedly (' + (signal || code) + ').'); stop(1); }
  });
  return child;
}
async function ready(port, child, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (child.exitCode !== null) throw new Error('Service could not start on local port ' + port);
    if (await listening(port)) return;
    await delay(1000);
  }
  throw new Error('Service startup timed out on local port ' + port);
}
function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  console.log('Stopping Postiz local services...');
  for (const { child } of children.reverse()) if (child.exitCode === null) child.kill();
  setTimeout(() => {
    for (const { child } of children) if (child.exitCode === null) child.kill('SIGKILL');
    for (const fd of handles) try { fs.closeSync(fd); } catch {}
    process.exit(exitCode);
  }, 3000).unref();
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
(async () => {
  for (const executable of [node, temporal, caddy]) if (!fs.existsSync(executable)) throw new Error('Local runtime missing');
  if (!fs.existsSync(path.join(stateDir, 'windows-config.json'))) throw new Error('Protected local configuration missing');
  for (const required of ['apps/backend/dist/apps/backend/src/main.js',
    'apps/orchestrator/dist/apps/orchestrator/src/main.js', 'apps/frontend/.next/BUILD_ID']) {
    if (!fs.existsSync(path.join(root, required))) throw new Error('Production build missing: ' + required);
  }
  for (const port of [3001, 3002, 3128, 4200, 7233, 7443]) {
    if (await listening(port)) throw new Error('Local port already in use: ' + port);
  }
  fs.mkdirSync(logsDir, { recursive: true });
  const taskServer = start('temporal', temporal, ['server', 'start-dev', '--ip', '127.0.0.1', '--port', '7233',
    '--headless', '--namespace', 'postiz-local', '--db-filename', path.join(stateDir, 'temporal.sqlite')]);
  await ready(7233, taskServer, 45);
  const proxy = start('egress', node, ['var/local/egress.cjs']); await ready(3128, proxy, 20);
  const backend = start('backend', node, ['--require', './var/local/windows/bootstrap.cjs',
    'apps/backend/dist/apps/backend/src/main.js'], 'backend'); await ready(3001, backend, 300);
  const frontend = start('frontend', node, ['--require', './var/local/windows/bootstrap.cjs',
    'node_modules/next/dist/bin/next', 'start', 'apps/frontend', '-H', '127.0.0.1', '-p', '4200'], 'frontend');
  await ready(4200, frontend, 90);
  const gateway = start('caddy', caddy, ['run', '--config', 'var/local/windows/Caddyfile', '--adapter', 'caddyfile']);
  await ready(7443, gateway, 45);
  const worker = start('worker', node, ['--require', './var/local/windows/bootstrap.cjs',
    'apps/orchestrator/dist/apps/orchestrator/src/main.js'], 'worker');
  await ready(3002, worker, 300);
  console.log('Postiz local running at http://localhost:7443 (press Ctrl+C to stop).');
  console.log('Private logs: local-data/secrets/logs');
})().catch(error => { console.error(error.message); stop(1); });
