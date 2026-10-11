-- Run only this read-only report in the shared project's SQL Editor.
-- Returns one JSON cell. Does not read application rows or password hashes.
SELECT jsonb_pretty(jsonb_build_object(
  'schemas', (SELECT coalesce(jsonb_agg(nspname), '[]'::jsonb)
    FROM pg_namespace WHERE nspname IN ('postiz', 'postiz_private', 'public')),
  'roles', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM (
    SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
    FROM pg_roles WHERE rolname IN ('postiz_owner', 'postiz_app')
  ) r),
  'public_table_grants', (SELECT coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM (
    SELECT n.nspname AS schema_name, c.relname AS object_name, a.privilege_type
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.relkind IN ('r', 'v', 'm', 'p') AND a.grantee = 0
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
  ) g),
  'public_definer_functions', (SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM (
    SELECT n.nspname AS schema_name, p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.prosecdef AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  ) f),
  'postiz_effective_table_access', (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
    SELECT n.nspname AS schema_name, c.relname AS object_name,
      has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
      has_table_privilege(r.oid, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE r.rolname = 'postiz_app' AND c.relkind IN ('r', 'v', 'm', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
  ) t)
)) AS postiz_security_inventory;
