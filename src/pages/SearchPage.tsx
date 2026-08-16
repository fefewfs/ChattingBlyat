import { useState, useCallback } from 'react';
import { semanticSearch, type SearchResultItem } from '@/lib/api';
import { Search, Loader2, FileText, Languages, ThumbsUp, ThumbsDown, BookOpen, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PageKey } from '@/components/AppShell';

interface SearchPageProps {
  onNavigate: (page: PageKey) => void;
}

export function SearchPage({ onNavigate }: SearchPageProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'positive' | 'negative' | undefined>>({});

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const data = await semanticSearch({ query: query.trim(), matchCount: 10 });
      setResults(data.results);
    } catch (err) {
      setError((err as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const giveFeedback = async (resultId: string, type: 'positive' | 'negative') => {
    setFeedbackGiven((prev) => ({ ...prev, [resultId]: type }));

    const { data: historyData } = await supabase
      .from('search_history')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (historyData) {
      await supabase
        .from('search_history')
        .update({ feedback: type })
        .eq('id', (historyData as { id: string }).id);
    }
  };

  const formatRelevance = (sim: number) => `${Math.round(sim * 100)}%`;

  return (
    <div className="p-8 max-w-5xl mx-auto fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">APEX Search</h1>
        <p className="text-text-secondary text-sm mt-1">
          Двуязычный семантический поиск по базе знаний. Ищет на русском и английском.
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <Search className="w-5 h-5 text-text-muted absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field pl-12 py-3 text-base"
            placeholder="Найди материалы по возражению дорого..."
            autoFocus
          />
          <button type="submit" disabled={loading} className="btn-primary absolute right-2 top-1/2 -translate-y-1/2 text-xs">
            {loading ? <Loader2 className="w-4 h-4 spin" /> : 'Искать'}
          </button>
        </div>
      </form>

      {error && (
        <div className="glass-card p-4 border-error/20 mb-6">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      {!hasSearched && !loading && (
        <div className="glass-card p-12 text-center">
          <Search className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted mb-4">Введите запрос для поиска по базе знаний</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              'возражение дорого',
              'price objection',
              'как закрыть сделку',
              'follow up after no response',
              'выявление потребностей',
            ].map((q) => (
              <button key={q} onClick={() => setQuery(q)} className="badge badge-muted hover:border-accent cursor-pointer">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-4 bg-bg-tertiary rounded w-1/3 mb-3" />
              <div className="h-3 bg-bg-tertiary rounded w-full mb-2" />
              <div className="h-3 bg-bg-tertiary rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && hasSearched && !error && (
        <div className="glass-card p-12 text-center">
          <BookOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted mb-2">Ничего не найдено</p>
          <p className="text-xs text-text-muted mb-4">
            Возможно, база знаний пуста или запрос не соответствует материалам.
          </p>
          <button onClick={() => onNavigate('import')} className="btn-secondary text-xs">
            Загрузить материалы
          </button>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-text-muted mb-2">{results.length} результатов</div>
          {results.map((r) => (
            <div key={r.chunk_id} className="glass-card glass-card-hover p-5 fade-in">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-text-secondary" />
                  <span className="text-sm font-medium">{r.source_filename || 'Без названия'}</span>
                  {typeof r.metadata?.language === 'string' && (
                    <span className="badge badge-muted text-[10px]">
                      <Languages className="w-2.5 h-2.5" />
                      {r.metadata.language.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="badge badge-accent text-[10px]">
                  {`Релевантность: ${formatRelevance(r.similarity)}`}
                </span>
              </div>

              {r.explanation_ru && (
                <p className="text-sm text-accent mb-3 italic">{r.explanation_ru}</p>
              )}

              <div className="text-sm text-text-secondary leading-relaxed bg-bg-secondary/50 rounded-lg p-3 border border-border-subtle">
                {r.content}
              </div>

              {r.content_ru && r.content_ru !== r.content && (
                <p className="text-xs text-text-muted mt-2 italic">Перевод: {r.content_ru}</p>
              )}

              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-text-muted">
                  Фрагмент #{r.chunk_index + 1}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => giveFeedback(r.chunk_id, 'positive')}
                    className={`btn-ghost p-1.5 ${feedbackGiven[r.chunk_id] === 'positive' ? 'text-success' : ''}`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => giveFeedback(r.chunk_id, 'negative')}
                    className={`btn-ghost p-1.5 ${feedbackGiven[r.chunk_id] === 'negative' ? 'text-error' : ''}`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
