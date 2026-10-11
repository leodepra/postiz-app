-- Inventory supplied by the user on 2026-10-10: target names do not exist.
-- Run as postgres in the SQL Editor. Creates only Postiz roles/schemas.
-- Does not change public/auth/storage schemas or disable the shared Data API.
-- Intentionally fails and rolls back if any name already exists.
BEGIN;
CREATE ROLE postiz_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE postiz_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT postiz_owner TO postgres;
-- No password here. Provision the role password separately through a secure channel.
CREATE SCHEMA postiz AUTHORIZATION postiz_owner;
CREATE SCHEMA postiz_private AUTHORIZATION postiz_owner;
REVOKE ALL ON SCHEMA postiz, postiz_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA postiz, postiz_private TO postiz_app;
SET LOCAL ROLE postiz_owner;
CREATE TABLE postiz_private.ephemeral (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  value text NOT NULL CHECK (value LIKE 'ephemeral:v1:%'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX ephemeral_expiry ON postiz_private.ephemeral(expires_at);
ALTER TABLE postiz_private.ephemeral ENABLE ROW LEVEL SECURITY;
CREATE POLICY postiz_app_ephemeral ON postiz_private.ephemeral TO postiz_app USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE postiz_private.ephemeral FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE postiz_private.ephemeral TO postiz_app;
-- Create Postiz application tables separately, as postiz_owner, ONLY in postiz.
-- Then grant their necessary DML privileges explicitly. Never grant ownership,
-- DDL or access to Clips-Imagens tables to the runtime role.
COMMIT;
SELECT 'postiz_base_created' AS result,
  to_regnamespace('postiz') IS NOT NULL AS postiz_schema,
  to_regclass('postiz_private.ephemeral') IS NOT NULL AS ephemeral_table,
  pg_has_role('postiz_app', 'postiz_owner', 'MEMBER') AS app_is_owner_member;
