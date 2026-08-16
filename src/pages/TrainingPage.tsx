import { useState, useRef, useEffect } from 'react';
import { startTraining, sendTrainingReply, finishTraining, type TrainingFinishResult } from '@/lib/api';
import { TRAINING_MODES, type TrainingMode } from '@/types';
import {
  Swords,
  Send,
  Loader2,
  BookOpen,
  CheckCircle,
  AlertCircle,
  Trophy,
  Lightbulb,
  Target,
  ArrowRight,
  X,
  RotateCcw,
  Lock,
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function TrainingPage() {
  const [phase, setPhase] = useState<'select' | 'chat' | 'feedback'>('select');
  const [mode, setMode] = useState<TrainingMode>('live_simulation');
  const [strictMode, setStrictMode] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [persona, setPersona] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<TrainingFinishResult | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await startTraining({ mode, strictMode });
      setSessionId(result.session_id);
      setPersona(result.client_persona);
      setMessages([{ role: 'assistant', content: result.opening_message }]);
      setPhase('chat');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionId || loading) return;
    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const result = await sendTrainingReply({ sessionId, message: userMessage });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
    } catch (err) {
      setError((err as Error).message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await finishTraining({ sessionId });
      setFeedback(result);
      setPhase('feedback');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPhase('select');
    setSessionId(null);
    setMessages([]);
    setFeedback(null);
    setError(null);
    setInput('');
    setPersona('');
    setShowSearch(false);
  };

  if (phase === 'select') {
    return (
      <div className="p-8 max-w-4xl mx-auto fade-in">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Training Arena</h1>
          <p className="text-text-secondary text-sm mt-1">
            Выберите режим тренировки. AI сыграет роль клиента.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {TRAINING_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`glass-card p-4 text-left transition-all ${
                mode === m.value ? 'border-accent bg-accent/5' : 'glass-card-hover'
              }`}
            >
              <div className="text-sm font-semibold mb-1">{m.label}</div>
              <div className="text-xs text-text-secondary">{m.description}</div>
            </button>
          ))}
        </div>

        <div className="glass-card p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-text-secondary" />
            <div>
              <div className="text-sm font-medium">Строгий режим</div>
              <div className="text-xs text-text-muted">Кнопка поиска материалов отключена во время тренировки</div>
            </div>
          </div>
          <button
            onClick={() => setStrictMode(!strictMode)}
            className={`w-11 h-6 rounded-full transition-colors relative ${strictMode ? 'bg-accent' : 'bg-bg-tertiary'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${strictMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {error && (
          <div className="glass-card p-4 border-error/20 mb-4">
            <div className="flex items-start gap-2 text-sm text-error">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <button onClick={handleStart} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 spin" /> : <Swords className="w-4 h-4" />}
          Начать тренировку
        </button>
      </div>
    );
  }

  if (phase === 'feedback' && feedback) {
    return (
      <div className="p-8 max-w-3xl mx-auto fade-in">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-dim flex items-center justify-center">
            <Trophy className="w-6 h-6 text-bg-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Анализ тренировки</h1>
            <p className="text-text-secondary text-sm">Результаты и рекомендации</p>
          </div>
        </div>

        <div className="glass-card p-6 mb-4 text-center">
          <div className="text-xs text-text-muted mb-2">Общая оценка</div>
          <div className={`text-5xl font-bold font-mono ${feedback.score >= 70 ? 'text-success' : feedback.score >= 40 ? 'text-warning' : 'text-error'}`}>
            {feedback.score}
          </div>
          <div className="text-xs text-text-muted mt-1">из 100</div>
        </div>

        {feedback.strengths.length > 0 && (
          <div className="glass-card p-5 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-success" />
              <h3 className="text-sm font-semibold text-success">Сильные стороны</h3>
            </div>
            <ul className="space-y-2">
              {feedback.strengths.map((s, i) => (
                <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                  <span className="text-success mt-0.5">•</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback.weaknesses.length > 0 && (
          <div className="glass-card p-5 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-error" />
              <h3 className="text-sm font-semibold text-error">Ошибки</h3>
            </div>
            <ul className="space-y-2">
              {feedback.weaknesses.map((s, i) => (
                <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                  <span className="text-error mt-0.5">•</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback.missed_opportunities.length > 0 && (
          <div className="glass-card p-5 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-warning" />
              <h3 className="text-sm font-semibold text-warning">Упущенные возможности</h3>
            </div>
            <ul className="space-y-2">
              {feedback.missed_opportunities.map((s, i) => (
                <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                  <span className="text-warning mt-0.5">•</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {feedback.recommended_alternative && (
          <div className="glass-card p-5 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-accent">Рекомендуемая альтернатива</h3>
            </div>
            <p className="text-sm text-text-secondary">{feedback.recommended_alternative}</p>
          </div>
        )}

        {feedback.next_exercise && (
          <div className="glass-card p-5 mb-6 border-accent/20">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-accent">Следующее упражнение</h3>
            </div>
            <p className="text-sm text-text-secondary">{feedback.next_exercise}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleReset} className="btn-primary flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Новая тренировка
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen fade-in">
      <div className="p-4 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Swords className="w-5 h-5 text-accent" />
          <div>
            <div className="text-sm font-semibold">{TRAINING_MODES.find((m) => m.value === mode)?.label}</div>
            <div className="text-xs text-text-muted">Клиент: {persona}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {!strictMode && (
            <button onClick={() => setShowSearch(true)} className="btn-ghost text-xs flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Найти материал
            </button>
          )}
          <button onClick={handleFinish} disabled={loading} className="btn-secondary text-xs">
            Завершить
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-error/10 border-b border-error/20">
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] rounded-lg p-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-gradient-to-br from-accent to-accent-dim text-bg-primary'
                  : 'glass-card'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="glass-card p-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 spin text-accent" />
              <span className="text-xs text-text-muted">Клиент печатает...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-border-subtle">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            className="input-field flex-1"
            placeholder="Ваш ответ клиенту..."
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="btn-primary flex items-center gap-2">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showSearch && (
        <SearchOverlay onClose={() => setShowSearch(false)} sessionId={sessionId ?? ''} />
      )}
    </div>
  );
}

function SearchOverlay({ onClose, sessionId }: { onClose: () => void; sessionId: string }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in">
      <div className="glass-card max-w-2xl w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Поиск материала</h3>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-text-muted">
          Поиск по текущему контексту тренировки. Анализирует диалог и находит релевантные материалы.
        </p>
        <div className="mt-4">
          <p className="text-xs text-text-muted">Сессия: {sessionId.slice(0, 8)}...</p>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="btn-secondary text-xs">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
