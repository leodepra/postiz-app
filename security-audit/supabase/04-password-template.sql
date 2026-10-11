-- TEMPLATE: replace the placeholder only in your Supabase SQL Editor.
-- Use a unique password from your password manager (24+ characters).
-- Do not send the password or the completed SQL back to the chat.
-- A single quote in a SQL password must be doubled: ' becomes ''.
-- This changes ONLY the dedicated Postiz user's password.
DO $postiz_password$
DECLARE new_password text := 'REPLACE_WITH_UNIQUE_POSTIZ_PASSWORD';
BEGIN
  IF new_password = 'REPLACE_WITH_UNIQUE_POSTIZ_PASSWORD' OR length(new_password) < 24 THEN
    RAISE EXCEPTION 'Replace the placeholder with a unique password of at least 24 characters';
  END IF;
  EXECUTE format('ALTER ROLE postiz_app PASSWORD %L', new_password);
END;
$postiz_password$;
