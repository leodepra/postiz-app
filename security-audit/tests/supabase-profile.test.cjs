require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSupabaseDatabase } = require('../../libraries/helpers/src/security/supabase-database.ts');
const { sealEphemeral, openEphemeral } = require('../../libraries/helpers/src/security/ephemeral-cipher.ts');

test('Supabase configuration requires the pinned endpoint, private schema, restricted role and verified TLS', () => {
  process.env.POSTIZ_DATABASE_HOST = 'db.example.supabase.co';
  const url = 'postgresql://postiz_app:fake-password@db.example.supabase.co:5432/postgres?schema=postiz&sslmode=require&sslaccept=strict';
  assert.equal(validateSupabaseDatabase(url).hostname, process.env.POSTIZ_DATABASE_HOST);
  for (const bad of [url.replace('db.example', 'db.other'), url.replace('postiz_app:', 'postgres:'),
    url.replace('schema=postiz', 'schema=public'), url.replace('sslmode=require', 'sslmode=disable'),
    url.replace('sslaccept=strict', 'sslaccept=accept_invalid_certs'), url.replace(':5432/', ':6543/'),
    url + '&sslaccept=accept_invalid_certs', url + '&options=malicious', 'invalid']) {
    assert.throws(() => validateSupabaseDatabase(bad), error => !error.message.includes('fake-password'));
  }
  process.env.POSTIZ_DATABASE_HOST = 'aws-0-us-east-1.pooler.supabase.com';
  assert.ok(validateSupabaseDatabase(url.replace('postiz_app:', 'postiz_app.example:').replace('db.example.supabase.co', process.env.POSTIZ_DATABASE_HOST)));
});

test('ephemeral encryption binds ciphertext to the record and rejects tampering and wrong keys', () => {
  process.env.LOCAL_TOKEN_KEY = 'a'.repeat(64);
  const value = { secret: 'fake-oauth-verifier' };
  const one = sealEphemeral(value, 'record-one');
  assert.notEqual(one, sealEphemeral(value, 'record-one'));
  assert.ok(!one.includes(value.secret));
  assert.deepEqual(openEphemeral(one, 'record-one'), value);
  assert.throws(() => openEphemeral(one, 'record-two'));
  const bytes = Buffer.from(one.slice('ephemeral:v1:'.length), 'base64url'); bytes[15] ^= 1;
  assert.throws(() => openEphemeral('ephemeral:v1:' + bytes.toString('base64url'), 'record-one'));
  process.env.LOCAL_TOKEN_KEY = 'b'.repeat(64);
  assert.throws(() => openEphemeral(one, 'record-one'));
});
