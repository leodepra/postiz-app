// Synthetic persistence test. Uses an isolated SQLite file, no Postiz credentials.
require('./tests/register.cjs');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Connection, Client } = require('@temporalio/client');
const { Worker, NativeConnection } = require('@temporalio/worker');
const { localTemporalDataConverter } = require('../libraries/nestjs-libraries/src/temporal/local-payload-codec.ts');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'local-data/temporal-probe');
fs.mkdirSync(directory, { recursive: true });
const db = path.join(directory, 'restart-' + randomBytes(8).toString('hex') + '.sqlite');
const cli = path.join(root, 'local-data/runtime/temporal/temporal.exe');
const log = fs.openSync(path.join(directory, 'restart-server.log'), 'a');
process.env.LOCAL_TOKEN_KEY = randomBytes(32).toString('hex');
const converter = localTemporalDataConverter();
let server, connection, native;
function start() { server = spawn(cli, ['server', 'start-dev', '--ip', '127.0.0.1', '--port', '17234',
  '--headless', '--namespace', 'postiz-restart-probe', '--db-filename', db],
  { windowsHide: true, stdio: ['ignore', log, log] }); }
async function connect() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { return await Connection.connect({ address: '127.0.0.1:17234', connectTimeout: '1s' }); }
    catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  throw new Error('Persistent Temporal test server unavailable');
}
async function stop() {
  if (native) { await native.close(); native = undefined; }
  if (connection) { await connection.close(); connection = undefined; }
  if (server && server.exitCode === null) {
    const child = server; child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 10000))]);
  }
}
(async () => {
  start(); connection = await connect(); native = await NativeConnection.connect({ address: '127.0.0.1:17234' });
  const worker = await Worker.create({ connection: native, namespace: 'postiz-restart-probe',
    taskQueue: 'security-restart-probe', workflowsPath: require.resolve('./tests/fixtures/temporal-probe.cjs'),
    activities: { echo: async value => value }, dataConverter: converter });
  const client = new Client({ connection, namespace: 'postiz-restart-probe', dataConverter: converter });
  const secret = 'synthetic-restart-' + randomBytes(16).toString('hex');
  let workflowId;
  await worker.runUntil(async () => {
    workflowId = 'restart-' + randomBytes(8).toString('hex');
    const handle = await client.workflow.start('encryptedProbe', { workflowId, taskQueue: 'security-restart-probe', args: [secret] });
    assert.equal(await handle.result(), secret);
  });
  await stop();
  start(); connection = await connect();
  const reopened = new Client({ connection, namespace: 'postiz-restart-probe', dataConverter: converter });
  const handle = reopened.workflow.getHandle(workflowId);
  assert.equal(await handle.result(), secret);
  const history = JSON.stringify(await handle.fetchHistory());
  assert.ok(!history.includes(secret) && !history.includes(Buffer.from(secret).toString('base64')));
  console.log(JSON.stringify({ persistentAfterRestart: true, encryptedHistory: true }));
})().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; })
  .finally(async () => { await stop(); fs.closeSync(log); });
