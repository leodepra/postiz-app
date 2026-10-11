'use strict';
// Opt-in integration test. Writes only random test keys in postiz_private.ephemeral.
require('../tests/register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../local-data/secrets/windows-config.json'), 'utf8'));
Object.assign(process.env, { DATABASE_URL: config.DATABASE_URL, POSTIZ_DATABASE_HOST: config.POSTIZ_DATABASE_HOST, LOCAL_TOKEN_KEY: config.LOCAL_TOKEN_KEY });
const { PrismaClient } = require('@prisma/client');
const { validateSupabaseDatabase } = require('../../libraries/helpers/src/security/supabase-database.ts');
const { PostgresEphemeralStore } = require('../../libraries/nestjs-libraries/src/security/postgres-ephemeral-store.ts');
validateSupabaseDatabase();
const db = new PrismaClient({ log: [] });
const store = new PostgresEphemeralStore();
const prefix = `security-probe:${randomUUID()}:`;
const keys = ['value', 'nx', 'consume', 'expiry', 'list', 'rate'].map(name => prefix + name);
const hash = key => createHash('sha256').update(key).digest('hex');
const hashes = [...keys.map(hash), hash(`throttle:test:${keys[5]}`)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let stage = 'connect';
async function run() {
  try {
    await db.$connect();
    stage = 'encrypted read/write';
    await store.set(keys[0], 'synthetic-value', 'EX', 30);
    assert.equal(await store.get(keys[0]), 'synthetic-value');
    const [row] = await db.$queryRaw`SELECT value FROM postiz_private.ephemeral WHERE key_hash = ${hash(keys[0])}`;
    assert.ok(row.value.startsWith('ephemeral:v1:') && !row.value.includes('synthetic-value'));
    stage = 'concurrent SET NX';
    const acquired = await Promise.all(Array.from({ length: 4 }, () => store.set(keys[1], 'test', 'EX', 30, 'NX')));
    assert.equal(acquired.filter(value => value === 'OK').length, 1);
    stage = 'concurrent GETDEL';
    await store.set(keys[2], 'single-use', 'EX', 30);
    const consumed = await Promise.all(Array.from({ length: 4 }, () => store.getdel(keys[2])));
    assert.equal(consumed.filter(value => value === 'single-use').length, 1);
    stage = 'expiry';
    await store.set(keys[3], 'expiring', 'EX', 1);
    await wait(1200);
    assert.equal(await store.get(keys[3]), null);
    stage = 'lists';
    await store.rpush(keys[4], 'a'); await store.rpush(keys[4], 'b');
    assert.deepEqual(await store.lrange(keys[4], 0, -1), ['a', 'b']);
    assert.equal(await store.expire(keys[4], 30), 1);
    stage = 'rate limiting';
    assert.equal((await store.increment(keys[5], 30000, 1, 1000, 'test')).isBlocked, false);
    assert.equal((await store.increment(keys[5], 30000, 1, 1000, 'test')).isBlocked, true);
    await wait(1200);
    assert.equal((await store.increment(keys[5], 30000, 1, 1000, 'test')).isBlocked, false);
    stage = 'authenticated expiry';
    await db.$executeRaw`UPDATE postiz_private.ephemeral SET expires_at = expires_at + interval '1 hour' WHERE key_hash = ${hash(keys[0])}`;
    await assert.rejects(store.get(keys[0]), /Invalid ephemeral expiry/);
    console.log(JSON.stringify({ success: true, checks: ['encrypted read/write', 'concurrent SET NX', 'single-use GETDEL', 'expiry', 'lists', 'rate limiting', 'authenticated expiry'] }));
  } finally {
    // Explicit random keys from this invocation only; never sweep other rows.
    for (const keyHash of hashes) await db.$executeRaw`DELETE FROM postiz_private.ephemeral WHERE key_hash = ${keyHash}`;
    console.log(JSON.stringify({ testRecordsRemoved: true }));
  }
}
run().catch(error => {
  console.log(JSON.stringify({ success: false, stage, code: /^P\d{4}$/.test(error.code || error.errorCode || '') ? (error.code || error.errorCode) : 'TEST_FAILED' }));
  process.exitCode = 1;
}).finally(async () => { await Promise.all([store.onApplicationShutdown(), db.$disconnect()]); });
