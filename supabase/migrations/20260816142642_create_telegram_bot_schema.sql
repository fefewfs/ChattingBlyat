/*
# Create Telegram Bot Schema for APEX Chatter Trainer

## Overview
Creates a complete set of tables for the Telegram bot interface of APEX Chatter Trainer.
These tables are separate from the existing web-app tables (which use auth.users UUIDs).
The Telegram bot connects server-to-server via DATABASE_URL, bypassing RLS.
All tables use tg_ prefix to avoid conflicts.

## New Tables
1. tg_users - Telegram user accounts (telegram_id as primary key)
2. tg_training_sessions - Training sessions linked to Telegram users
3. tg_training_messages - Messages within training sessions
4. tg_skill_profiles - Per-user skill assessments (12 dimensions, 0-100)
5. tg_training_feedback - Post-session analysis and feedback
6. tg_knowledge_items - Knowledge base entries (scripts, objections, dialogues, etc.)
7. tg_search_history - Search query history
8. tg_ai_error_logs - AI provider error logs for admin debugging

## Security
- RLS enabled on all tables as defense-in-depth
- Server-to-server connection uses service role key which bypasses RLS
- No policies needed since access is via service role key only
*/

-- ============ tg_users ============
CREATE TABLE IF NOT EXISTS tg_users (
  telegram_id bigint PRIMARY KEY,
  username text,
  first_name text,
  last_name text,
  language_code text,
  is_admin boolean NOT NULL DEFAULT false,
  training_count integer NOT NULL DEFAULT 0,
  best_score integer NOT NULL DEFAULT 0,
  avg_score numeric(5,2) NOT NULL DEFAULT 0,
  total_errors integer NOT NULL DEFAULT 0,
  completed_simulations integer NOT NULL DEFAULT 0,
  current_level integer NOT NULL DEFAULT 1,
  weak_skill text,
  created_at timestamptz DEFAULT now(),
  last_active timestamptz DEFAULT now()
);

ALTER TABLE tg_users ENABLE ROW LEVEL SECURITY;

-- ============ tg_training_sessions ============
CREATE TABLE IF NOT EXISTS tg_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL REFERENCES tg_users(telegram_id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'live_simulation',
  skill_focus text,
  persona text,
  status text NOT NULL DEFAULT 'active',
  score integer,
  summary text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE tg_training_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tg_sessions_user ON tg_training_sessions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tg_sessions_status ON tg_training_sessions(status);

-- ============ tg_training_messages ============
CREATE TABLE IF NOT EXISTS tg_training_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES tg_training_sessions(id) ON DELETE CASCADE,
  telegram_id bigint NOT NULL REFERENCES tg_users(telegram_id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  message_index integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tg_training_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tg_messages_session ON tg_training_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_tg_messages_user ON tg_training_messages(telegram_id);

-- ============ tg_skill_profiles ============
CREATE TABLE IF NOT EXISTS tg_skill_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE REFERENCES tg_users(telegram_id) ON DELETE CASCADE,
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

ALTER TABLE tg_skill_profiles ENABLE ROW LEVEL SECURITY;

-- ============ tg_training_feedback ============
CREATE TABLE IF NOT EXISTS tg_training_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES tg_training_sessions(id) ON DELETE CASCADE,
  telegram_id bigint NOT NULL REFERENCES tg_users(telegram_id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  strengths jsonb DEFAULT '[]'::jsonb,
  weaknesses jsonb DEFAULT '[]'::jsonb,
  missed_opportunities jsonb DEFAULT '[]'::jsonb,
  recommended_alternative text,
  ideal_response text,
  next_exercise text,
  skill_updates jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tg_training_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tg_feedback_session ON tg_training_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_tg_feedback_user ON tg_training_feedback(telegram_id);

-- ============ tg_knowledge_items ============
CREATE TABLE IF NOT EXISTS tg_knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  content text NOT NULL,
  tags text[] DEFAULT '{}',
  created_by bigint REFERENCES tg_users(telegram_id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tg_knowledge_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tg_knowledge_category ON tg_knowledge_items(category);
CREATE INDEX IF NOT EXISTS idx_tg_knowledge_tags ON tg_knowledge_items USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_tg_knowledge_search ON tg_knowledge_items USING gin(to_tsvector('russian', title || ' ' || content));

-- ============ tg_search_history ============
CREATE TABLE IF NOT EXISTS tg_search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL REFERENCES tg_users(telegram_id) ON DELETE CASCADE,
  query text NOT NULL,
  results_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tg_search_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tg_search_user ON tg_search_history(telegram_id);

-- ============ tg_ai_error_logs ============
CREATE TABLE IF NOT EXISTS tg_ai_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint,
  provider text NOT NULL,
  model text,
  error_message text NOT NULL,
  error_code integer,
  operation text,
  latency_ms integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tg_ai_error_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tg_errors_created ON tg_ai_error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tg_errors_provider ON tg_ai_error_logs(provider);

-- ============ updated_at trigger for tg_skill_profiles ============
CREATE OR REPLACE FUNCTION tg_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tg_skill_profiles_updated ON tg_skill_profiles;
CREATE TRIGGER trg_tg_skill_profiles_updated BEFORE UPDATE ON tg_skill_profiles
  FOR EACH ROW EXECUTE FUNCTION tg_update_updated_at();

DROP TRIGGER IF EXISTS trg_tg_knowledge_updated ON tg_knowledge_items;
CREATE TRIGGER trg_tg_knowledge_updated BEFORE UPDATE ON tg_knowledge_items
  FOR EACH ROW EXECUTE FUNCTION tg_update_updated_at();

-- ============ Full-text search function for knowledge base ============
CREATE OR REPLACE FUNCTION tg_search_knowledge(
  search_query text,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  category text,
  content text,
  tags text[],
  ts_rank real
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ki.id,
    ki.title,
    ki.category,
    ki.content,
    ki.tags,
    ts_rank(to_tsvector('russian', ki.title || ' ' || ki.content), plainto_tsquery('russian', search_query)) AS ts_rank
  FROM tg_knowledge_items ki
  WHERE to_tsvector('russian', ki.title || ' ' || ki.content) @@ plainto_tsquery('russian', search_query)
  ORDER BY ts_rank DESC
  LIMIT match_count;
$$;

-- ============ Seed initial knowledge base items ============
INSERT INTO tg_knowledge_items (title, category, content, tags)
SELECT * FROM (VALUES
  ('Скрипт: Работа с возражением "Дорого"', 'Scripts', 'Когда клиент говорит "дорого", не спорь о цене. Переведи разговор в ценность: "Понимаю, что цена важна. Давайте посмотрим, что именно вы получаете за эти деньги..." Спроси: "Дорого по сравнению с чем?" Выяви реальное возражение — за ценой часто стоит страх, недоверие или непонимание ценности.', ARRAY['возражение', 'цена', 'дорого']),
  ('Скрипт: Клиент перестал отвечать', 'Scripts', 'Если клиент перестал отвечать, не пиши "Вы где?" или "Что решили?". Используй value-driven follow-up: "Привет! Вспомнил наш разговор про [тема]. Думал над вашим вопросом и понял, что можно [решение]. Хочу показать вам за 5 минут — когда удобно?"', ARRAY['follow-up', 'молчание', 'нет ответа']),
  ('Скрипт: Клиент хочет уйти к конкуренту', 'Scripts', 'Не критикуй конкурента. Согласись и переведи: "Понимаю, что вы сравниваете. Это нормально. Можете ли вы сказать, что именно у них лучше? Часто за этим стоит [конкретное преимущество]. Давайте я покажу, как у нас это работает..."', ARRAY['конкурент', 'уход', 'сравнение']),
  ('Возражение: "Подумаю"', 'Objections', '"Подумаю" — это не отказ, это просьба о помощи в принятии решения. Не дави. Спроси: "Конечно! Чтобы вам было проще подумать, скажите — что именно вас смущает? Может, я смогу прояснить прямо сейчас." Если клиент называет реальную причину — работай с ней.', ARRAY['подумаю', 'возражение', 'время']),
  ('Возражение: "Нет денег"', 'Objections', '"Нет денег" часто означает "не вижу ценности". Не предлагай скидку сразу. Спроси: "Понимаю. А если бы деньги были — вы бы хотели это приобрести? Что именно вам нравится в предложении?" Если клиент описывает ценность — работай с ней. Деньги находятся, когда ценность очевидна.', ARRAY['нет денег', 'бюджет', 'возражение']),
  ('Возражение: "Уже есть поставщик"', 'Objections', 'Не пытайся сразу заменить. Спроси: "Здорово! А что работает хорошо? А что — не очень? Часто наши клиенты использовали [конкурент] и переходили к нам из-за [конкретная причина]. Хотите сравнить?"', ARRAY['поставщик', 'конкурент', 'возражение']),
  ('Психология: Принцип дефицита', 'Psychology', 'Люди хотят то, что недоступно. Используй: "У нас осталось 3 места на этом тарифе" или "Эта цена действует до конца недели". Но не ври — если обман раскрыт, доверие потеряно навсегда. Дефицит должен быть реальным.', ARRAY['дефицит', 'психология', 'продажи']),
  ('Психология: Социальное доказательство', 'Psychology', 'Покажи, что другие уже выбрали: "Более 200 компаний используют наш продукт" или "Ваша отрасль — наш основной сегмент, работаем с [названия]." Конкретика важнее общих слов.', ARRAY['социальное доказательство', 'психология', 'доверие']),
  ('Ошибка: Слишком много вопросов подряд', 'Mistakes', 'Не задавай 3+ вопросов в одном сообщении. Клиент ответит на последний и пропустит остальные. Один вопрос — один ответ. Это контроль диалога.', ARRAY['ошибка', 'вопросы', 'диалог']),
  ('Ошибка: Продажа вместо выяснения', 'Mistakes', 'Не начинай с презентации продукта. Сначала выясни потребность. Если ты продаёшь до того, как понял клиента — ты продаёшь вслепую. Правильный порядок: контакт → выявление → презентация → закрытие.', ARRAY['ошибка', 'презентация', 'выявление']),
  ('Шаблон: Холодный первый контакт', 'Templates', 'Не пиши "Здравствуйте, я из компании X, мы предлагаем..." Начни с проблемы: "Привет, [имя]! Заметил, что вы [конкретное наблюдение]. Работаю с [отрасль] и помогаю [конкретная польза]. Есть 5 минут обсудить?"', ARRAY['холодный контакт', 'шаблон', 'первое сообщение']),
  ('Шаблон: Закрытие сделки', 'Templates', 'Не спрашивай "Ну что, берёте?" Предложи конкретный следующий шаг: "Отлично! Тогда предлагаю так: я готовлю договор сегодня, вы подписываете завтра, и в понедельник мы уже стартуем. Подходит?" Конкретность снижает сопротивление.', ARRAY['закрытие', 'шаблон', 'сделка'])
) AS t(title, category, content, tags)
ON CONFLICT DO NOTHING;
