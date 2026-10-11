'use strict';
// Read-only database probe. Never print connection strings or raw errors.
require('../../../security-audit/tests/register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { validateSupabaseDatabase } = require('../../../libraries/helpers/src/security/supabase-database.ts');
let client;
async function main() {
  const configuration = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../local-data/secrets/windows-config.json'), 'utf8'));
  process.env.POSTIZ_DATABASE_HOST = configuration.POSTIZ_DATABASE_HOST;
  const url = validateSupabaseDatabase(configuration.DATABASE_URL);
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('connection_limit', '1');
  client = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  await client.$connect();
  const result = await client.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const [connection] = await tx.$queryRaw`SELECT current_user AS role, current_schema() AS schema,
      (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls`;
    const [tables] = await tx.$queryRaw`SELECT count(*)::int AS count FROM information_schema.tables
      WHERE table_schema = 'postiz' AND table_type = 'BASE TABLE'`;
    return { connection, applicationTables: tables.count };
  }, { timeout: 15000 });
  if (result.connection.role !== 'postiz_app' || result.connection.schema !== 'postiz' || result.connection.tls !== true || result.applicationTables !== 88) {
    throw Object.assign(new Error('Unexpected database context'), { code: 'UNEXPECTED_CONTEXT' });
  }
  console.log(JSON.stringify({ success: true, ...result }));
}
main().catch(error => {
  const explanations = {
    P1000: 'Authentication failed for the dedicated database user.',
    P1001: 'Database endpoint unreachable; verify DNS, IPv6 or use the session pooler.',
    P1002: 'Database connection timed out.',
    P1011: 'TLS validation failed; do not disable certificate verification.',
    UNEXPECTED_CONTEXT: 'Unexpected role, schema, TLS state or table count.',
  };
  const suppliedCode = error.code || error.errorCode;
  const code = Object.hasOwn(explanations, suppliedCode) ? suppliedCode : 'PROBE_FAILED';
  console.log(JSON.stringify({ success: false, code, reason: explanations[code] || 'Configuration or database probe failed; raw error withheld to protect credentials.' }));
  process.exitCode = 1;
}).finally(async () => { await client?.$disconnect(); });
