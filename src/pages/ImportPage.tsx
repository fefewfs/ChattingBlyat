import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadAndProcessFile } from '@/lib/api';
import type { PageKey } from '@/components/AppShell';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X, File } from 'lucide-react';
import type { KnowledgeSource } from '@/types';

interface UploadItem {
  id: string;
  filename: string;
  size: number;
  progress: number;
  status: 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
}

interface ImportProps {
  onNavigate: (page: PageKey) => void;
}

export function ImportPage({ onNavigate }: ImportProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [recentSources, setRecentSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);

  const loadSources = useCallback(async () => {
    const { data } = await supabase
      .from('knowledge_sources')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setRecentSources((data ?? []) as KnowledgeSource[]);
    setLoading(false);
  }, []);

  const handleFiles = useCallback(async (files: FileList) => {
    const newUploads: UploadItem[] = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      filename: f.name,
      size: f.size,
      progress: 0,
      status: 'uploading',
    }));

    setUploads((prev) => [...newUploads, ...prev]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uploadId = newUploads[i].id;

      try {
        await uploadAndProcessFile(file, (pct) => {
          setUploads((prev) =>
            prev.map((u) => (u.id === uploadId ? { ...u, progress: pct, status: pct < 100 ? 'uploading' : 'processing' } : u)),
          );
        });

        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: 'done', progress: 100 } : u)),
        );
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: 'error', error: (err as Error).message } : u)),
        );
      }
    }

    loadSources();
  }, [loadSources]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeUpload = (id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  };

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-8 max-w-5xl mx-auto fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Импорт материалов</h1>
        <p className="text-text-secondary text-sm mt-1">
          Загрузите файлы — они автоматически обработаются и добавятся в базу знаний.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`glass-card border-2 border-dashed p-10 text-center transition-all ${
          dragActive ? 'border-accent bg-accent/5' : 'border-border-default'
        }`}
      >
        <div className="w-14 h-14 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mx-auto mb-4">
          <Upload className="w-7 h-7" />
        </div>
        <p className="text-base font-medium mb-1">Перетащите файлы сюда</p>
        <p className="text-sm text-text-secondary mb-4">PDF, DOCX, XLSX, CSV, TXT, Markdown, JSON</p>
        <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Выбрать файлы
          <input
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </label>
      </div>

      {uploads.length > 0 && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">Загрузки</h2>
          {uploads.map((u) => (
            <div key={u.id} className="glass-card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
                {u.status === 'done' ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : u.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-error" />
                ) : (
                  <Loader2 className="w-5 h-5 text-accent spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">{u.filename}</span>
                  <span className="text-xs text-text-muted shrink-0 ml-2">{formatSize(u.size)}</span>
                </div>
                {u.status === 'uploading' && (
                  <div className="skill-bar">
                    <div className="skill-bar-fill bg-accent" style={{ width: `${u.progress}%` }} />
                  </div>
                )}
                {u.status === 'processing' && (
                  <span className="text-xs text-accent">Обработка и индексация...</span>
                )}
                {u.status === 'done' && (
                  <span className="text-xs text-success">Готово — добавлено в базу знаний</span>
                )}
                {u.status === 'error' && (
                  <span className="text-xs text-error">{u.error}</span>
                )}
              </div>
              <button onClick={() => removeUpload(u.id)} className="btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Последние файлы</h2>
        {loading ? (
          <div className="text-text-muted text-sm">Загрузка...</div>
        ) : recentSources.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <File className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-muted">Пока нет загруженных файлов</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSources.map((s) => (
              <div key={s.id} className="glass-card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.filename}</div>
                  <div className="text-xs text-text-muted">
                    {s.size_bytes ? formatSize(s.size_bytes) : ''} · {s.language}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={() => onNavigate('knowledge')} className="btn-secondary text-xs">
          Перейти к базе знаний
        </button>
        <button onClick={() => onNavigate('search')} className="btn-secondary text-xs">
          Перейти к поиску
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return <span className="badge badge-success">Готово</span>;
  if (status === 'processing' || status === 'indexing') return <span className="badge badge-warning">Обработка</span>;
  if (status === 'error') return <span className="badge badge-error">Ошибка</span>;
  return <span className="badge badge-muted">Загрузка</span>;
}
