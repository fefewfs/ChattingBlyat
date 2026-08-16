import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpen, FileText, Search, ChevronRight, Tag } from 'lucide-react';
import type { KnowledgeSource, KnowledgeTag } from '@/types';
import type { PageKey } from '@/components/AppShell';

interface KnowledgePageProps {
  onNavigate: (page: PageKey) => void;
}

export function KnowledgePage({ onNavigate }: KnowledgePageProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [tags, setTags] = useState<Record<string, KnowledgeTag[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'ready' | 'processing' | 'error'>('all');
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('knowledge_sources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        setLoading(false);
        return;
      }
      const sourcesData = (data ?? []) as KnowledgeSource[];
      setSources(sourcesData);

      if (sourcesData.length > 0) {
        const sourceIds = sourcesData.map((s) => s.id);
        const { data: tagsData } = await supabase
          .from('knowledge_tags')
          .select('*')
          .in('source_id', sourceIds);
        const tagMap: Record<string, KnowledgeTag[]> = {};
        for (const t of (tagsData ?? []) as KnowledgeTag[]) {
          if (!tagMap[t.source_id]) tagMap[t.source_id] = [];
          tagMap[t.source_id].push(t);
        }
        setTags(tagMap);
      }

      setLoading(false);
    }
    load();
  }, []);

  const filtered = sources.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search && !s.filename.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-8 max-w-6xl mx-auto fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">База знаний</h1>
          <p className="text-text-secondary text-sm mt-1">Все загруженные материалы и их статус</p>
        </div>
        <button onClick={() => onNavigate('import')} className="btn-primary text-xs">
          Загрузить ещё
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
            placeholder="Поиск по названию файла..."
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | 'ready' | 'processing' | 'error')}
          className="input-field w-auto"
        >
          <option value="all">Все</option>
          <option value="ready">Готово</option>
          <option value="processing">Обработка</option>
          <option value="error">Ошибка</option>
        </select>
      </div>

      {loading ? (
        <div className="text-text-muted text-sm">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <BookOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted mb-4">Нет файлов в базе знаний</p>
          <button onClick={() => onNavigate('import')} className="btn-primary text-xs">
            Загрузить первый файл
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.id}>
              <button
                onClick={() => setSelectedSource(selectedSource?.id === s.id ? null : s)}
                className="glass-card glass-card-hover p-4 w-full flex items-center gap-3 text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.filename}</div>
                  <div className="text-xs text-text-muted flex items-center gap-2 mt-0.5">
                    {formatSize(s.size_bytes)}
                    {s.language !== 'unknown' && <span>· {s.language.toUpperCase()}</span>}
                    <span>· {new Date(s.created_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                </div>
                {tags[s.id]?.length > 0 && (
                  <div className="flex gap-1">
                    {tags[s.id].slice(0, 3).map((t) => (
                      <span key={t.id} className="badge badge-muted text-[10px]">
                        <Tag className="w-2.5 h-2.5" />
                        {t.tag}
                      </span>
                    ))}
                  </div>
                )}
                <StatusBadge status={s.status} />
                <ChevronRight className={`w-4 h-4 text-text-muted transition-transform ${selectedSource?.id === s.id ? 'rotate-90' : ''}`} />
              </button>

              {selectedSource?.id === s.id && (
                <div className="ml-13 mt-1 mb-2 p-4 bg-bg-secondary/50 rounded-lg border border-border-subtle slide-in-right">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-text-muted">Тип: </span>
                      <span>{s.mime_type || 'неизвестно'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Язык: </span>
                      <span>{s.language}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Создан: </span>
                      <span>{new Date(s.created_at).toLocaleString('ru-RU')}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Обновлён: </span>
                      <span>{new Date(s.updated_at).toLocaleString('ru-RU')}</span>
                    </div>
                    {s.title && (
                      <div className="col-span-2">
                        <span className="text-text-muted">Заголовок: </span>
                        <span>{s.title}</span>
                      </div>
                    )}
                    {s.description && (
                      <div className="col-span-2">
                        <span className="text-text-muted">Описание: </span>
                        <span>{s.description}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return <span className="badge badge-success">Готово</span>;
  if (status === 'processing' || status === 'indexing') return <span className="badge badge-warning">Обработка</span>;
  if (status === 'error') return <span className="badge badge-error">Ошибка</span>;
  return <span className="badge badge-muted">Загрузка</span>;
}
