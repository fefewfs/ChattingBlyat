import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SKILL_KEYS, SKILL_LABELS, type SkillProfile, type TrainingSession, type TrainingFeedback } from '@/types';
import { TrendingUp, Target, Trophy, Clock, Swords } from 'lucide-react';

export function ProgressPage() {
  const [profile, setProfile] = useState<SkillProfile | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [feedbacks, setFeedbacks] = useState<TrainingFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: profileData }, { data: sessionsData }, { data: feedbacksData }] = await Promise.all([
        supabase.from('skill_profiles').select('*').maybeSingle(),
        supabase.from('training_sessions').select('*').order('started_at', { ascending: false }).limit(20),
        supabase.from('training_feedback').select('*').order('created_at', { ascending: false }).limit(10),
      ]);

      setProfile(profileData as SkillProfile | null);
      setSessions((sessionsData ?? []) as TrainingSession[]);
      setFeedbacks((feedbacksData ?? []) as TrainingFeedback[]);
      setLoading(false);
    }
    load();
  }, []);

  const skills = SKILL_KEYS.map((k) => ({
    key: k,
    label: SKILL_LABELS[k],
    value: (profile?.[k] as number) ?? 50,
  }));

  const avgScore = Math.round(skills.reduce((s, sk) => s + sk.value, 0) / skills.length);
  const weakest = [...skills].sort((a, b) => a.value - b.value).slice(0, 3);
  const strongest = [...skills].sort((a, b) => b.value - a.value).slice(0, 3);

  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const avgSessionScore = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((s, sess) => s + (sess.score ?? 0), 0) / completedSessions.length)
    : 0;

  const getSkillColor = (v: number) => {
    if (v < 40) return 'bg-error';
    if (v < 60) return 'bg-warning';
    if (v < 80) return 'bg-accent';
    return 'bg-success';
  };

  const getSkillTextColor = (v: number) => {
    if (v < 40) return 'text-error';
    if (v < 60) return 'text-warning';
    if (v < 80) return 'text-accent';
    return 'text-success';
  };

  return (
    <div className="p-8 max-w-6xl mx-auto fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Прогресс</h1>
        <p className="text-text-secondary text-sm mt-1">Ваш профиль навыков и история тренировок</p>
      </div>

      {loading ? (
        <div className="text-text-muted text-sm">Загрузка...</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Средний навык" value={String(avgScore)} />
            <StatCard icon={<Trophy className="w-4 h-4" />} label="Средний балл тренировки" value={String(avgSessionScore)} />
            <StatCard icon={<Swords className="w-4 h-4" />} label="Всего тренировок" value={String(sessions.length)} />
            <StatCard icon={<Target className="w-4 h-4" />} label="Завершено" value={String(completedSessions.length)} />
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="glass-card p-6">
              <h2 className="text-base font-semibold mb-5">Сильные стороны</h2>
              <div className="space-y-4">
                {strongest.map((s) => (
                  <div key={s.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-text-secondary">{s.label}</span>
                      <span className={`text-sm font-mono font-medium ${getSkillTextColor(s.value)}`}>{s.value}</span>
                    </div>
                    <div className="skill-bar">
                      <div className={`skill-bar-fill ${getSkillColor(s.value)}`} style={{ width: `${s.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-6">
              <h2 className="text-base font-semibold mb-5">Зоны для роста</h2>
              <div className="space-y-4">
                {weakest.map((s) => (
                  <div key={s.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-text-secondary">{s.label}</span>
                      <span className={`text-sm font-mono font-medium ${getSkillTextColor(s.value)}`}>{s.value}</span>
                    </div>
                    <div className="skill-bar">
                      <div className={`skill-bar-fill ${getSkillColor(s.value)}`} style={{ width: `${s.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card p-6 mb-8">
            <h2 className="text-base font-semibold mb-5">Все навыки</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              {skills.map((s) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-text-secondary">{s.label}</span>
                    <span className={`text-sm font-mono font-medium ${getSkillTextColor(s.value)}`}>{s.value}</span>
                  </div>
                  <div className="skill-bar">
                    <div className={`skill-bar-fill ${getSkillColor(s.value)}`} style={{ width: `${s.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h2 className="text-base font-semibold mb-5">История тренировок</h2>
            {sessions.length === 0 ? (
              <div className="text-center py-8">
                <Swords className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-muted">Пока нет тренировок</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary/50 border border-border-subtle">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${s.status === 'completed' ? 'bg-success' : 'bg-warning'}`} />
                      <div>
                        <div className="text-sm font-medium">{modeLabel(s.mode)}</div>
                        <div className="text-xs text-text-muted flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(s.started_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs ${s.status === 'completed' ? 'text-success' : 'text-warning'}`}>
                        {s.status === 'completed' ? 'Завершена' : 'Активна'}
                      </span>
                      {s.score !== null && (
                        <span className={`text-lg font-mono font-bold ${s.score >= 70 ? 'text-success' : s.score >= 40 ? 'text-warning' : 'text-error'}`}>
                          {s.score}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 text-text-muted mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-3xl font-bold font-mono">{value}</div>
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
