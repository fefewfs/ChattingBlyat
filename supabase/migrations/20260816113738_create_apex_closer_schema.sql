/*
# APEX CLOSER OS - Core Database Schema

## Overview
Creates the complete database schema for APEX CLOSER OS, an AI sales training platform.
All tables are multi-user (owner-scoped) with Row Level Security enabled.

## New Tables

1. **knowledge_sources** - Metadata for uploaded files (originals stored in R2/Storage)
   - id, user_id, filename, mime_type, size_bytes, storage_path, language, status, title, description, created_at, updated_at
   - status: 'uploading' | 'processing' | 'indexing' | 'ready' | 'error'

2. **knowledge_chunks** - Text chunks extracted from sources with embeddings
   - id, source_id, user_id, chunk_index, content, content_ru (translation if needed), embedding (vector), tokens, metadata, created_at

3. **knowledge_tags** - Tags for organizing knowledge sources
   - id, source_id, user_id, tag, created_at

4. **training_sessions** - Individual training sessions
   - id, user_id, mode, skill_focus, status, score, summary, started_at, ended_at
   - mode: 'live_simulation' | 'objection_training' | 'closing_training' | 'discovery_training' | 'rapport_training' | 'followup_training' | 'pressure_test' | 'random_drill'
   - status: 'active' | 'completed' | 'abandoned'

5. **training_messages** - Messages within a training session
   - id, session_id, user_id, role, content, message_index, created_at
   - role: 'user' | 'assistant' | 'system'

6. **skill_profiles** - User skill assessment across 12 dimensions
   - id, user_id, rapport, discovery, qualification, objection_handling, value_creation, persuasion, dialog_control, closing, followup, upsell, adaptability, script_selection, updated_at
   - Each skill: 0-100 integer score

7. **training_feedback** - Post-session analysis and feedback
   - id, session_id, user_id, strengths, weaknesses, missed_opportunities, recommended_alternative, relevant_source_ids, next_exercise, created_at

8. **search_history** - User search queries and results
   - id, user_id, query, results_count, top_result_ids, feedback, created_at
   - feedback: 'positive' | 'negative' | null

9. **ai_settings** - Per-user AI provider configuration
   - id, user_id, chat_provider, chat_model, embedding_provider, embedding_model, reranker_provider, reranker_model, updated_at

## Security
- RLS enabled on ALL tables
- All tables have user_id with DEFAULT auth.uid()
- 4 CRUD policies per table (select/insert/update/delete), all owner-scoped
- Only authenticated users can access data
*/

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============ knowledge_sources ============
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  storage_path text NOT NULL,
  language text DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'uploading',
  title text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sources" ON knowledge_sources;
CREATE POLICY "select_own_sources" ON knowledge_sources FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_sources" ON knowledge_sources;
CREATE POLICY "insert_own_sources" ON knowledge_sources FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_sources" ON knowledge_sources;
CREATE POLICY "update_own_sources" ON knowledge_sources FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_sources" ON knowledge_sources;
CREATE POLICY "delete_own_sources" ON knowledge_sources FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_user ON knowledge_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_status ON knowledge_sources(status);

-- ============ knowledge_chunks ============
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  content_ru text,
  embedding vector(1536),
  tokens integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_chunks" ON knowledge_chunks;
CREATE POLICY "select_own_chunks" ON knowledge_chunks FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_chunks" ON knowledge_chunks;
CREATE POLICY "insert_own_chunks" ON knowledge_chunks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_chunks" ON knowledge_chunks;
CREATE POLICY "update_own_chunks" ON knowledge_chunks FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_chunks" ON knowledge_chunks;
CREATE POLICY "delete_own_chunks" ON knowledge_chunks FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_user ON knowledge_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- ============ knowledge_tags ============
CREATE TABLE IF NOT EXISTS knowledge_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tags" ON knowledge_tags;
CREATE POLICY "select_own_tags" ON knowledge_tags FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_tags" ON knowledge_tags;
CREATE POLICY "insert_own_tags" ON knowledge_tags FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_tags" ON knowledge_tags;
CREATE POLICY "update_own_tags" ON knowledge_tags FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_tags" ON knowledge_tags;
CREATE POLICY "delete_own_tags" ON knowledge_tags FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_tags_user ON knowledge_tags(user_id);

-- ============ training_sessions ============
CREATE TABLE IF NOT EXISTS training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'live_simulation',
  skill_focus text,
  status text NOT NULL DEFAULT 'active',
  score integer,
  summary text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sessions" ON training_sessions;
CREATE POLICY "select_own_sessions" ON training_sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_sessions" ON training_sessions;
CREATE POLICY "insert_own_sessions" ON training_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_sessions" ON training_sessions;
CREATE POLICY "update_own_sessions" ON training_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_sessions" ON training_sessions;
CREATE POLICY "delete_own_sessions" ON training_sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_training_sessions_user ON training_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status);

-- ============ training_messages ============
CREATE TABLE IF NOT EXISTS training_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  message_index integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE training_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON training_messages;
CREATE POLICY "select_own_messages" ON training_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_messages" ON training_messages;
CREATE POLICY "insert_own_messages" ON training_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_messages" ON training_messages;
CREATE POLICY "update_own_messages" ON training_messages FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_messages" ON training_messages;
CREATE POLICY "delete_own_messages" ON training_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_training_messages_session ON training_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_training_messages_user ON training_messages(user_id);

-- ============ skill_profiles ============
CREATE TABLE IF NOT EXISTS skill_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  rapport integer NOT NULL DEFAULT 50,
  discovery integer NOT NULL DEFAULT 50,
  qualification integer NOT NULL DEFAULT 50,
  objection_handling integer NOT NULL DEFAULT 50,
  value_creation integer NOT NULL DEFAULT 50,
  persuasion integer NOT NULL DEFAULT 50,
  dialog_control integer NOT NULL DEFAULT 50,
  closing integer NOT NULL DEFAULT 50,
  followup integer NOT NULL DEFAULT 50,
  upsell integer NOT NULL DEFAULT 50,
  adaptability integer NOT NULL DEFAULT 50,
  script_selection integer NOT NULL DEFAULT 50,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE skill_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON skill_profiles;
CREATE POLICY "select_own_profile" ON skill_profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_profile" ON skill_profiles;
CREATE POLICY "insert_own_profile" ON skill_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_profile" ON skill_profiles;
CREATE POLICY "update_own_profile" ON skill_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_profile" ON skill_profiles;
CREATE POLICY "delete_own_profile" ON skill_profiles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ training_feedback ============
CREATE TABLE IF NOT EXISTS training_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  strengths jsonb DEFAULT '[]'::jsonb,
  weaknesses jsonb DEFAULT '[]'::jsonb,
  missed_opportunities jsonb DEFAULT '[]'::jsonb,
  recommended_alternative text,
  relevant_source_ids jsonb DEFAULT '[]'::jsonb,
  next_exercise text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE training_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_feedback" ON training_feedback;
CREATE POLICY "select_own_feedback" ON training_feedback FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_feedback" ON training_feedback;
CREATE POLICY "insert_own_feedback" ON training_feedback FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_feedback" ON training_feedback;
CREATE POLICY "update_own_feedback" ON training_feedback FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_feedback" ON training_feedback;
CREATE POLICY "delete_own_feedback" ON training_feedback FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_training_feedback_session ON training_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_training_feedback_user ON training_feedback(user_id);

-- ============ search_history ============
CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL,
  results_count integer DEFAULT 0,
  top_result_ids jsonb DEFAULT '[]'::jsonb,
  feedback text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_searches" ON search_history;
CREATE POLICY "select_own_searches" ON search_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_searches" ON search_history;
CREATE POLICY "insert_own_searches" ON search_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_searches" ON search_history;
CREATE POLICY "update_own_searches" ON search_history FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_searches" ON search_history;
CREATE POLICY "delete_own_searches" ON search_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);

-- ============ ai_settings ============
CREATE TABLE IF NOT EXISTS ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_provider text DEFAULT 'openrouter',
  chat_model text DEFAULT 'anthropic/claude-3.5-sonnet',
  embedding_provider text DEFAULT 'openrouter',
  embedding_model text DEFAULT 'openai/text-embedding-3-small',
  reranker_provider text,
  reranker_model text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_settings" ON ai_settings;
CREATE POLICY "select_own_ai_settings" ON ai_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_ai_settings" ON ai_settings;
CREATE POLICY "insert_own_ai_settings" ON ai_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_ai_settings" ON ai_settings;
CREATE POLICY "update_own_ai_settings" ON ai_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_ai_settings" ON ai_settings;
CREATE POLICY "delete_own_ai_settings" ON ai_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_sources_updated ON knowledge_sources;
CREATE TRIGGER trg_knowledge_sources_updated BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_skill_profiles_updated ON skill_profiles;
CREATE TRIGGER trg_skill_profiles_updated BEFORE UPDATE ON skill_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_ai_settings_updated ON ai_settings;
CREATE TRIGGER trg_ai_settings_updated BEFORE UPDATE ON ai_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ Storage bucket for files ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-files', 'knowledge-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for knowledge-files bucket
DROP POLICY IF EXISTS "Users can upload own files" ON storage.objects;
CREATE POLICY "Users can upload own files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-files' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can read own files" ON storage.objects;
CREATE POLICY "Users can read own files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-files' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
CREATE POLICY "Users can delete own files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-files' AND auth.uid() = owner);

-- ============ match_chunks function for vector search ============
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  content text,
  content_ru text,
  similarity float,
  metadata jsonb,
  chunk_index integer
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kc.id,
    kc.source_id,
    kc.content,
    kc.content_ru,
    1 - (kc.embedding <=> query_embedding) AS similarity,
    kc.metadata,
    kc.chunk_index
  FROM knowledge_chunks kc
  WHERE kc.user_id = match_user_id
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;