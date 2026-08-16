import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { PageKey } from '@/components/AppShell';
import {
  Swords,
  Search,
  Upload,
  TrendingUp,
  BookOpen,
  Zap,
  AlertTriangle,
  ArrowRight,
  Clock,
  Target,
} from 'lucide-react';
import { SKILL_KEYS, SKILL_LABELS, type SkillProfile, type KnowledgeSource } from '@/types';

interface DashboardProps {
  onNavigate: (page: PageKey) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SkillProfile | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [readyCount, setReadyCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [recentSessions, setRecentSessions] = useState<{ id: string; mode: string; score: number | null; started_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: profileData }, { count: sources }, { count: ready }, { count: sessions }, { data: recent }] = await Promise.all([
        supabase.from('skill_profiles').select('*').maybeSingle(),
        supabase.from('knowledge_sources').select('*', { count: 'exact', head: true }),
        supabase.from('knowledge_sources').select('*', { count: 'exact', head: true }).eq('status', 'ready'),
        supabase.from('training_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('training_sessions').select('id, mode, score, started_at').order('started_at', { ascending: false }).limit(5),
      ]);

      setProfile(profileData as SkillProfile | null);
      setSourceCount(sources ?? 0);
      setReadyCount(ready ?? 0);
      setSessionCount(sessions ?? 0);
      setRecentSessions(recent ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const weakestSkills = SKILL_KEYS
    .map((k) => ({ key: k, label: SKILL_LABELS[k], value: (profile?.[k] as number) ?? 50 }))
    .sort((a, b) => a.value - b.value)
    .slice(0, 4);

  return (
    <div className="p-8 max-w-7xl mx-auto fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Главная</h1>
        <p className="text-text-secondary text-sm mt-1">
          Добро пожаловать{user?.email ? `, ${user.email}` : ''}. Это ваш командный центр AI-тренировок.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <QuickAction
          icon={<Swords className="w-5 h-5" />}
          title="Начать тренировку"
          description="Симуляция с AI-клиентом"
          onClick={() => onNavigate('training')}
        />
        <QuickAction
          icon={<Search className="w-5 h-5" />}
          title="Найти материал"
          description="Двуязычный семантический поиск"
          onClick={() => onNavigate('search')}
        />
        <QuickAction
          icon={<Upload className="w-5 h-5" />}
          title="Добавить материал"
          description="Загрузить PDF, DOCX, TXT"
          onClick={() => onNavigate('import')}
        />
        <QuickAction
          icon={<Target className="w-5 h-5" />}
          title="Слабые навыки"
          description="Адаптивные рекомендации"
          onClick={() => onNavigate('progress')}
        />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard label="Файлов в базе" value={loading ? '—' : String(sourceCount)} subtext={`${readyCount} готово`} icon={<BookOpen className="w-4 h-4" />} />
        <StatCard label="Тренировок" value={loading ? '—' : String(sessionCount)} subtext="всего" icon={<Swords className="w-4 h-4" />} />
        <StatCard
          label="Средний балл"
          value={loading ? '—' : profile ? String(Math.round(SKILL_KEYS.reduce((s, k) => s + (profile[k] as number), 0) / SKILL_KEYS.length)) : '50'}
          subtext="по всем навыкам"
          icon={<TrendingUp className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold">Текущие слабые навыки</h2>
            <button onClick={() => onNavigate('progress')} className="btn-ghost text-xs">
              Подробнее <ArrowRight className="w-3 h-3 inline ml-1" />
            </button>
          </div>
          {loading ? (
            <div className="text-text-muted text-sm">Загрузка...</div>
          ) : (
            <div className="space-y-4">
              {weakestSkills.map((s) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-text-secondary">{s.label}</span>
                    <span className={`text-sm font-mono font-medium ${s.value < 40 ? 'text-error' : s.value < 60 ? 'text-warning' : 'text-accent'}`}>
                      {s.value}
                    </span>
                  </div>
                  <div className="skill-bar">
                    <div
                      className={`skill-bar-fill ${s.value < 40 ? 'bg-error' : s.value < 60 ? 'bg-warning' : 'bg-accent'}`}
                      style={{ width: `${s.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold">Последние тренировки</h2>
            <button onClick={() => onNavigate('training')} className="btn-ghost text-xs">
              К тренировкам <ArrowRight className="w-3 h-3 inline ml-1" />
            </button>
          </div>
          {loading ? (
            <div className="text-text-muted text-sm">Загрузка...</div>
          ) : recentSessions.length === 0 ? (
            <div className="text-center py-8">
              <Swords className="w-8 h-8 text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-muted">Пока нет тренировок</p>
              <button onClick={() => onNavigate('training')} className="btn-primary mt-4 text-xs">
                Начать первую
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary/50 border border-border-subtle">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${s.score !== null ? 'bg-accent' : 'bg-text-muted'}`} />
                    <div>
                      <div className="text-sm font-medium">{modeLabel(s.mode)}</div>
                      <div className="text-xs text-text-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(s.started_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                  {s.score !== null && (
                    <span className={`text-lg font-mono font-bold ${s.score >= 70 ? 'text-success' : s.score >= 40 ? 'text-warning' : 'text-error'}`}>
                      {s.score}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {readyCount === 0 && !loading && (
        <div className="mt-6 glass-card p-5 border-warning/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-warning">База знаний пуста</p>
            <p className="text-xs text-text-secondary mt-1">
              Загрузите материалы (PDF, DOCX, TXT), чтобы включить семантический поиск и RAG-тренировки.
            </p>
            <button onClick={() => onNavigate('import')} className="btn-secondary mt-3 text-xs">
              Загрузить файлы
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAction({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass-card glass-card-hover p-5 text-left group">
      <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-3 group-hover:bg-accent/20 transition-colors">
        {icon}
      </div>
      <div className="text-sm font-semibold mb-1">{title}</div>
      <div className="text-xs text-text-secondary">{description}</div>
    </button>
  );
}

function StatCard({ label, value, subtext, icon }: { label: string; value: string; subtext: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 text-text-muted mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-3xl font-bold font-mono">{value}</div>
      <div className="text-xs text-text-muted mt-1">{subtext}</div>
    </div>
  );
}

function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    live_simulation: 'Живая симуляция',
    objection_training: 'Тренировка возражений',
    closing_training: 'Тренировка закрытия',
    discovery_training: 'Тренировка выявления',
    rapport_training: 'Тренировка раппорта',
    followup_training: 'Тренировка follow-up',
    pressure_test: 'Стресс-тест',
    random_drill: 'Случайное упражнение',
  };
  return labels[mode] ?? mode;
}
