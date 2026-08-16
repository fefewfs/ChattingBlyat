-- 1. Lock down app_secrets: revoke all privileges from anon and authenticated
--    This table stores API keys and must only be accessible via service role
REVOKE ALL ON app_secrets FROM anon, authenticated;

-- 2. Fix mutable search_path on functions
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.match_chunks(vector, uuid, integer) SET search_path = public;

-- 3. Revoke EXECUTE on handle_new_user from anon and authenticated
--    It's a trigger function — should not be callable via REST API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
