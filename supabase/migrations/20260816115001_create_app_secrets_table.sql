/*
# Create app_secrets table for server-side API keys

1. New Tables
- `app_secrets` — stores AI provider API keys for edge functions
  - id, key_name (unique), key_value, created_at, updated_at
2. Security
- RLS enabled, NO policies — only the service role (used by edge functions) can read/write
- The anon/authenticated roles have zero access
*/

CREATE TABLE IF NOT EXISTS app_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name text UNIQUE NOT NULL,
  key_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- Insert the OpenRouter API key
INSERT INTO app_secrets (key_name, key_value)
VALUES ('OPENROUTER_API_KEY', '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')
ON CONFLICT (key_name) DO UPDATE SET key_value = EXCLUDED.key_value, updated_at = now();