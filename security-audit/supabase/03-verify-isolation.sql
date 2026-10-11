-- Read-only verification after scripts 01 and 02. Returns one JSON cell.
WITH app AS (
  SELECT * FROM pg_roles WHERE rolname = 'postiz_app'
), own_tables AS (
  SELECT c.*, n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('postiz', 'postiz_private') AND c.relkind IN ('r', 'p')
), external_access AS (
  SELECT n.nspname AS schema_name, c.relname AS object_name,
    has_table_privilege(a.oid, c.oid, 'SELECT') AS can_select,
    has_table_privilege(a.oid, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write,
    has_any_column_privilege(a.oid, c.oid, 'SELECT,INSERT,UPDATE') AS column_access
  FROM app a CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm')
    AND n.nspname NOT IN ('postiz', 'postiz_private', 'pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
    AND has_schema_privilege(a.oid, n.oid, 'USAGE')
    AND (has_table_privilege(a.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_any_column_privilege(a.oid, c.oid, 'SELECT,INSERT,UPDATE'))
), api_access AS (
  SELECT r.rolname, t.nspname AS schema_name, t.relname AS table_name
  FROM own_tables t CROSS JOIN pg_roles r
  WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
    AND (has_schema_privilege(r.oid, t.relnamespace, 'USAGE')
      OR has_table_privilege(r.oid, t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_any_column_privilege(r.oid, t.oid, 'SELECT,INSERT,UPDATE'))
)
SELECT jsonb_pretty(jsonb_build_object(
  'app_role_restricted', (SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
    AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit FROM app),
  'app_is_owner_member', pg_has_role('postiz_app', 'postiz_owner', 'MEMBER'),
  'app_can_create_schema', has_database_privilege('postiz_app', current_database(), 'CREATE'),
  'app_can_create_in_public', has_schema_privilege('postiz_app', 'public', 'CREATE'),
  'app_can_create_in_postiz', has_schema_privilege('postiz_app', 'postiz', 'CREATE'),
  'app_can_create_in_private', has_schema_privilege('postiz_app', 'postiz_private', 'CREATE'),
  'application_tables', (SELECT count(*) FROM own_tables WHERE nspname = 'postiz'),
  'private_tables', (SELECT count(*) FROM own_tables WHERE nspname = 'postiz_private'),
  'tables_without_rls', (SELECT coalesce(jsonb_agg(nspname || '.' || relname), '[]'::jsonb) FROM own_tables WHERE NOT relrowsecurity),
  'tables_with_wrong_owner', (SELECT coalesce(jsonb_agg(nspname || '.' || relname), '[]'::jsonb) FROM own_tables WHERE pg_get_userbyid(relowner) <> 'postiz_owner'),
  'tables_missing_app_permissions', (SELECT coalesce(jsonb_agg(t.nspname || '.' || t.relname), '[]'::jsonb)
    FROM own_tables t CROSS JOIN app a WHERE NOT (
      has_schema_privilege(a.oid, t.relnamespace, 'USAGE')
      AND has_table_privilege(a.oid, t.oid, 'SELECT') AND has_table_privilege(a.oid, t.oid, 'INSERT')
      AND has_table_privilege(a.oid, t.oid, 'UPDATE') AND has_table_privilege(a.oid, t.oid, 'DELETE'))),
  'unexpected_policies', (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    FROM pg_policies p WHERE p.schemaname IN ('postiz', 'postiz_private') AND p.roles <> ARRAY['postiz_app']::name[]),
  'api_role_access', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM api_access x),
  'outside_table_access', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM external_access x),
  'accessible_external_definer_functions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema_name', n.nspname, 'function_name', p.proname)), '[]'::jsonb)
    FROM app a CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'postiz', 'postiz_private')
      AND has_schema_privilege(a.oid, n.oid, 'USAGE') AND has_function_privilege(a.oid, p.oid, 'EXECUTE'))
)) AS postiz_isolation_report;
