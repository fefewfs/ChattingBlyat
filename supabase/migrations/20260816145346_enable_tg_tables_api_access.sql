-- The Telegram bot uses the Supabase REST API (PostgREST) with the service role key,
-- which bypasses RLS entirely. These policies exist as a secondary safety net
-- in case the anon key is used for any read operations.

-- Drop any existing policies first (safe to re-run)
DROP POLICY IF EXISTS "tg_all_users" ON tg_users;
DROP POLICY IF EXISTS "tg_all_sessions" ON tg_training_sessions;
DROP POLICY IF EXISTS "tg_all_messages" ON tg_training_messages;
DROP POLICY IF EXISTS "tg_all_profiles" ON tg_skill_profiles;
DROP POLICY IF EXISTS "tg_all_feedback" ON tg_training_feedback;
DROP POLICY IF EXISTS "tg_all_knowledge" ON tg_knowledge_items;
DROP POLICY IF EXISTS "tg_all_search_history" ON tg_search_history;
DROP POLICY IF EXISTS "tg_all_ai_errors" ON tg_ai_error_logs;

-- Allow full access via anon/authenticated (bot uses service role key which bypasses RLS)
CREATE POLICY "tg_all_users" ON tg_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tg_all_sessions" ON tg_training_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tg_all_messages" ON tg_training_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tg_all_profiles" ON tg_skill_profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tg_all_feedback" ON tg_training_feedback FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tg_all_knowledge" ON tg_knowledge_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tg_all_search_history" ON tg_search_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tg_all_ai_errors" ON tg_ai_error_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
