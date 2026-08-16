/*
# Auto-create user profile data on signup

Creates a trigger on auth.users that fires AFTER INSERT to:
1. Create a skill_profiles row (all skills default to 50)
2. Create an ai_settings row (default provider/model config)

This runs with SECURITY DEFINER + search_path = public so it can bypass RLS
on the target tables — the new user hasn't logged in yet so RLS would block
the insert from the anon role.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create skill profile with default values
  INSERT INTO public.skill_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create default AI settings
  INSERT INTO public.ai_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop old trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant execute to authenticated and anon (trigger runs as definer)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, anon;