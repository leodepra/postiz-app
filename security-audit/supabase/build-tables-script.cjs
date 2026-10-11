// Offline packaging only. Never connects to a database or executes SQL.
const fs = require('node:fs');
const path = require('node:path');
const rawPath = path.join(__dirname, 'generated-tables.sql');
const raw = fs.readFileSync(rawPath, 'utf8');
if (/\b(DROP|TRUNCATE|DELETE|INSERT|UPDATE|GRANT|REVOKE|SET|CREATE\s+SCHEMA)\b/i.test(raw.replace(/--[^\n]*/g, '').replace(/ON (DELETE|UPDATE) (CASCADE|RESTRICT|SET NULL)/g, ''))) {
  throw new Error('Unexpected generated SQL: manual review required');
}
if (/"(?:public|auth|storage)"\s*\./i.test(raw)) throw new Error('Unexpected external schema reference');
const tables = [...raw.matchAll(/^CREATE TABLE "([A-Za-z0-9_]+)"/gm)].map(x => x[1]);
const types = [...raw.matchAll(/^CREATE TYPE "([A-Za-z0-9_]+)"/gm)].map(x => x[1]);
if (!tables.length || !types.length) throw new Error('Missing generated objects');
const rules = tables.map(name => `ALTER TABLE postiz."${name}" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE postiz."${name}" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE postiz."${name}" TO postiz_app;
CREATE POLICY postiz_app_access ON postiz."${name}" TO postiz_app USING (true) WITH CHECK (true);`).join('\n');
const enums = types.map(name => `REVOKE ALL ON TYPE postiz."${name}" FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON TYPE postiz."${name}" TO postiz_app;`).join('\n');
fs.writeFileSync(path.join(__dirname, '02-application-tables.sql'), `-- Generated offline from this checkout's Prisma schema. Run AFTER 01.
-- Creates ${tables.length} tables and ${types.length} enum types only within postiz.
-- Does not migrate, reset, introspect or modify the Clips-Imagens public schema.
BEGIN;
SET LOCAL ROLE postiz_owner;
SET LOCAL search_path = postiz, pg_catalog, pg_temp;
${raw}
${rules}
${enums}
COMMIT;
SELECT 'postiz_tables_created' AS result, count(*) AS table_count
FROM pg_tables WHERE schemaname = 'postiz';
`, 'utf8');
process.stdout.write(JSON.stringify({ tables: tables.length, enums: types.length, output: '02-application-tables.sql' }));
