// Synthetic workflow only: never loads application credentials or social tokens.
require('./tests/register.cjs');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Connection, Client } = require('@temporalio/client');
const { Worker, NativeConnection } = require('@temporalio/worker');
const { localTemporalDataConverter } = require('../libraries/nestjs-libraries/src/temporal/local-payload-codec.ts');
const root = path.resolve(__dirname, '..');
const probeDir = path.join(root, 'local-data', 'temporal-probe');
fs.mkdirSync(probeDir, { recursive: true });
process.env.LOCAL_TOKEN_KEY = randomBytes(32).toString('hex');
const serverLog = fs.openSync(path.join(probeDir, 'server.log'), 'a');
const server = spawn(path.join(root, 'local-data/runtime/temporal/temporal.exe'),
  ['server', 'start-dev', '--ip', '127.0.0.1', '--port', '17233', '--headless', '--namespace', 'postiz-probe'],
  { windowsHide: true, stdio: ['ignore', serverLog, serverLog] });
let connection, native;
(async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { connection = await Connection.connect({ address: '127.0.0.1:17233', connectTimeout: '1s' }); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  if (!connection) throw new Error('Synthetic Temporal server unavailable');
  native = await NativeConnection.connect({ address: '127.0.0.1:17233' });
  const dataConverter = localTemporalDataConverter();
  const worker = await Worker.create({ connection: native, namespace: 'postiz-probe', taskQueue: 'security-probe',
    workflowsPath: require.resolve('./tests/fixtures/temporal-probe.cjs'),
    activities: { echo: async value => value }, dataConverter });
  const client = new Client({ connection, namespace: 'postiz-probe', dataConverter });
  const secret = 'synthetic-token-' + randomBytes(16).toString('hex');
  await worker.runUntil(async () => {
    const handle = await client.workflow.start('encryptedProbe', { taskQueue: 'security-probe',
      workflowId: 'encrypted-probe-' + randomBytes(8).toString('hex'), args: [secret] });
    assert.equal(await handle.result(), secret);
    const history = await handle.fetchHistory();
    const serialized = JSON.stringify(history);
    assert.ok(!serialized.includes(secret));
    assert.ok(!serialized.includes(Buffer.from(secret).toString('base64')));
    let encrypted = 0;
    function inspect(value) {
      if (!value || typeof value !== 'object') return;
      if (value.metadata?.encoding) {
        assert.equal(Buffer.from(value.metadata.encoding).toString(), 'binary/postiz-encrypted-v1');
        encrypted++;
      }
      for (const child of Object.values(value)) if (!(child instanceof Uint8Array)) inspect(child);
    }
    inspect(history);
    assert.ok(encrypted >= 4, 'Workflow and activity input/output must be encrypted');
    console.log(JSON.stringify({ passed: true, encryptedPayloads: encrypted, nativeWorker: true }));
  });
})().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; })
  .finally(async () => { if (native) await native.close(); if (connection) await connection.close(); server.kill(); fs.closeSync(serverLog); });
