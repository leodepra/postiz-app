-- Read-only catalog inspection. No row data, password hashes or function bodies.
BEGIN READ ONLY;
SELECT nspname AS schema_name
FROM pg_namespace WHERE nspname IN ('postiz', 'postiz_private', 'public');

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
FROM pg_roles WHERE rolname IN ('postiz_owner', 'postiz_app');

-- PUBLIC grants apply even to NOINHERIT roles. An app-specific role does not
-- override these. Review before granting a shared-database login to Postiz.
SELECT n.nspname AS schema_name, c.relname AS object_name, a.privilege_type
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
WHERE c.relkind IN ('r', 'v', 'm', 'p') AND a.grantee = 0
  AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%';

-- SECURITY DEFINER functions can provide access despite table restrictions.
SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
WHERE p.prosecdef AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema');

-- Effective table privileges after provision (returns no rows before role creation).
SELECT n.nspname AS schema_name, c.relname AS object_name,
  has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
  has_table_privilege(r.oid, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE r.rolname = 'postiz_app' AND c.relkind IN ('r', 'v', 'm', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%';
COMMIT;
