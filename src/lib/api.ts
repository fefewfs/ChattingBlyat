import { supabase } from '@/lib/supabase';
import type { TrainingMode, KnowledgeChunk } from '@/types';

async function callEdgeFunction(name: string, body: unknown) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Не авторизован');

  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown>,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    throw new Error(error.message || 'Ошибка сервера');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export interface TrainingStartParams {
  mode: TrainingMode;
  skillFocus?: string;
  strictMode?: boolean;
}

export interface TrainingStartResult {
  session_id: string;
  opening_message: string;
  client_persona: string;
}

export async function startTraining(params: TrainingStartParams): Promise<TrainingStartResult> {
  return callEdgeFunction('apex-training', { action: 'start', ...params });
}

export interface TrainingReplyParams {
  sessionId: string;
  message: string;
}

export interface TrainingReplyResult {
  reply: string;
  message_id: string;
}

export async function sendTrainingReply(params: TrainingReplyParams): Promise<TrainingReplyResult> {
  return callEdgeFunction('apex-training', { action: 'reply', ...params });
}

export interface TrainingFinishParams {
  sessionId: string;
}

export interface TrainingFinishResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  missed_opportunities: string[];
  recommended_alternative: string | null;
  relevant_source_ids: string[];
  next_exercise: string | null;
  skill_updates: Record<string, number>;
}

export async function finishTraining(params: TrainingFinishParams): Promise<TrainingFinishResult> {
  return callEdgeFunction('apex-training', { action: 'finish', ...params });
}

export interface SearchParams {
  query: string;
  matchCount?: number;
}

export interface SearchResultItem {
  chunk_id: string;
  source_id: string;
  content: string;
  content_ru: string | null;
  similarity: number;
  metadata: Record<string, unknown>;
  chunk_index: number;
  source_filename: string;
  source_title: string | null;
  explanation_ru: string;
}

export interface SearchResultPayload {
  results: SearchResultItem[];
  query_ru: string;
}

export async function semanticSearch(params: SearchParams): Promise<SearchResultPayload> {
  return callEdgeFunction('apex-search', params);
}

export interface SearchDuringTrainingParams {
  sessionId: string;
  currentContext: string;
}

export async function searchDuringTraining(
  params: SearchDuringTrainingParams,
): Promise<SearchResultPayload> {
  return callEdgeFunction('apex-search', { ...params, training_context: true });
}

export interface ProcessFileParams {
  sourceId: string;
  filePath: string;
  mimeType: string;
  filename: string;
}

export async function processFile(params: ProcessFileParams): Promise<{ status: string; chunks_count: number }> {
  return callEdgeFunction('apex-process', params);
}

export interface UploadAndProcessResult {
  source: {
    id: string;
    filename: string;
    status: string;
  };
  chunks_count: number;
}

export async function uploadAndProcessFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadAndProcessResult> {
  const fileExt = file.name.split('.').pop() ?? 'txt';
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('knowledge-files')
    .upload(filePath, file);

  if (uploadError) throw new Error(`Ошибка загрузки: ${uploadError.message}`);

  const { data: sourceData, error: insertError } = await supabase
    .from('knowledge_sources')
    .insert({
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      storage_path: filePath,
      status: 'processing',
    })
    .select()
    .single();

  if (insertError) throw new Error(`Ошибка базы: ${insertError.message}`);

  const result = await processFile({
    sourceId: sourceData.id,
    filePath,
    mimeType: file.type || 'application/octet-stream',
    filename: file.name,
  });

  return {
    source: {
      id: sourceData.id,
      filename: file.name,
      status: result.status,
    },
    chunks_count: result.chunks_count,
  };
}

export async function getKnowledgeChunks(sourceId: string): Promise<KnowledgeChunk[]> {
  const { data, error } = await supabase
    .from('knowledge_chunks')
    .select('*')
    .eq('source_id', sourceId)
    .order('chunk_index', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
