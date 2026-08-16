export type SourceStatus = 'uploading' | 'processing' | 'indexing' | 'ready' | 'error';

export interface KnowledgeSource {
  id: string;
  user_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  language: string;
  status: SourceStatus;
  title: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: string;
  source_id: string;
  user_id: string;
  chunk_index: number;
  content: string;
  content_ru: string | null;
  embedding: number[] | null;
  tokens: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KnowledgeTag {
  id: string;
  source_id: string;
  user_id: string;
  tag: string;
  created_at: string;
}

export type TrainingMode =
  | 'live_simulation'
  | 'objection_training'
  | 'closing_training'
  | 'discovery_training'
  | 'rapport_training'
  | 'followup_training'
  | 'pressure_test'
  | 'random_drill';

export interface TrainingSession {
  id: string;
  user_id: string;
  mode: TrainingMode;
  skill_focus: string | null;
  status: 'active' | 'completed' | 'abandoned';
  score: number | null;
  summary: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface TrainingMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_index: number;
  created_at: string;
}

export interface SkillProfile {
  id: string;
  user_id: string;
  rapport: number;
  discovery: number;
  qualification: number;
  objection_handling: number;
  value_creation: number;
  persuasion: number;
  dialog_control: number;
  closing: number;
  followup: number;
  upsell: number;
  adaptability: number;
  script_selection: number;
  updated_at: string;
}

export interface TrainingFeedback {
  id: string;
  session_id: string;
  user_id: string;
  strengths: string[];
  weaknesses: string[];
  missed_opportunities: string[];
  recommended_alternative: string | null;
  relevant_source_ids: string[];
  next_exercise: string | null;
  created_at: string;
}

export interface SearchHistoryItem {
  id: string;
  user_id: string;
  query: string;
  results_count: number;
  top_result_ids: string[];
  feedback: 'positive' | 'negative' | null;
  created_at: string;
}

export interface AISettings {
  id: string;
  user_id: string;
  chat_provider: string;
  chat_model: string;
  embedding_provider: string;
  embedding_model: string;
  reranker_provider: string | null;
  reranker_model: string | null;
  updated_at: string;
}

export interface SearchResult {
  chunk_id: string;
  source_id: string;
  content: string;
  content_ru: string | null;
  similarity: number;
  metadata: Record<string, unknown>;
  chunk_index: number;
  source_filename?: string;
  source_title?: string;
  explanation_ru?: string;
}

export const SKILL_KEYS = [
  'rapport',
  'discovery',
  'qualification',
  'objection_handling',
  'value_creation',
  'persuasion',
  'dialog_control',
  'closing',
  'followup',
  'upsell',
  'adaptability',
  'script_selection',
] as const;

export const SKILL_LABELS: Record<string, string> = {
  rapport: 'Установление контакта',
  discovery: 'Выявление потребностей',
  qualification: 'Квалификация',
  objection_handling: 'Работа с возражениями',
  value_creation: 'Создание ценности',
  persuasion: 'Убеждение',
  dialog_control: 'Контроль диалога',
  closing: 'Закрытие',
  followup: 'Follow-up',
  upsell: 'Upsell',
  adaptability: 'Адаптивность',
  script_selection: 'Выбор подходящего скрипта',
};

export const TRAINING_MODES: { value: TrainingMode; label: string; description: string }[] = [
  { value: 'live_simulation', label: 'Живая симуляция', description: 'Полный диалог с клиентом от начала до закрытия' },
  { value: 'objection_training', label: 'Тренировка возражений', description: 'Отработка конкретных возражений клиента' },
  { value: 'closing_training', label: 'Тренировка закрытия', description: 'Техники закрытия сделки' },
  { value: 'discovery_training', label: 'Тренировка выявления', description: 'Выявление потребностей и квалификация' },
  { value: 'rapport_training', label: 'Тренировка раппорта', description: 'Установление контакта и доверия' },
  { value: 'followup_training', label: 'Тренировка follow-up', description: 'Возврат к клиенту после отказа' },
  { value: 'pressure_test', label: 'Стресс-тест', description: 'Жёсткий клиент, нестандартные ситуации' },
  { value: 'random_drill', label: 'Случайное упражнение', description: 'Случайный сценарий и режим' },
];
