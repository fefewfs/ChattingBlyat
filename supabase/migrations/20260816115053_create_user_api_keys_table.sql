/*
# Add user_api_keys table for per-user AI provider keys

1. New Tables
- `user_api_keys` — stores per-user API keys for AI providers
  - id, user_id, key_name (e.g. "OPENROUTER_API_KEY"), key_value (encrypted), created_at, updated_at
  - Unique constraint on (user_id, key_name)
2. Security
- RLS enabled, owner-scoped CRUD (authenticated users can only see their own keys)
- key_value is stored as text — edge functions read it via service role
*/

CREATE TABLE IF NOT EXISTS user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  key_name text NOT NULL,
  key_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, key_name)
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_api_keys" ON user_api_keys;
CREATE POLICY "select_own_api_keys" ON user_api_keys FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_api_keys" ON user_api_keys;
CREATE POLICY "insert_own_api_keys" ON user_api_keys FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_api_keys" ON user_api_keys;
CREATE POLICY "update_own_api_keys" ON user_api_keys FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_api_keys" ON user_api_keys;
CREATE POLICY "delete_own_api_keys" ON user_api_keys FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user ON user_api_keys(user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_user_api_keys_updated ON user_api_keys;
CREATE TRIGGER trg_user_api_keys_updated BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();