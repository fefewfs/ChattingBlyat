import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { checkSupabaseConnection } from '@/lib/supabase';
import { Zap, Loader2, AlertCircle, CheckCircle, Wifi, WifiOff } from 'lucide-react';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connStatus, setConnStatus] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [connDetail, setConnDetail] = useState<string>('');

  useEffect(() => {
    checkSupabaseConnection().then((result) => {
      setConnStatus(result.ok ? 'ok' : 'fail');
      setConnDetail(result.detail);
    });
  }, []);

  const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorDetail(null);
    setInfo(null);

    if (!validateEmail(email)) {
      setError('Неверный email');
      return;
    }

    if (password.length < 6) {
      setError('Пароль слишком короткий');
      return;
    }

    setLoading(true);

    if (mode === 'signup') {
      const { error, needsConfirmation } = await signUp(email, password);
      if (error) {
        setError(error);
        // If it's a network error, show the diagnostic detail
        if (connStatus === 'fail') {
          setErrorDetail(connDetail);
        }
        setLoading(false);
        return;
      }
      if (needsConfirmation) {
        setInfo('Аккаунт создан. Проверьте почту для подтверждения email, затем войдите.');
        setMode('signin');
        setLoading(false);
        return;
      }
      // No confirmation needed — session created, App will redirect to Dashboard
      return;
    }

    const { error } = await signIn(email, password);
    if (error) {
      setError(error);
      if (connStatus === 'fail') {
        setErrorDetail(connDetail);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dim flex items-center justify-center">
              <Zap className="w-6 h-6 text-bg-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">APEX CLOSER OS</h1>
          <p className="text-text-secondary text-sm mt-1">AI-тренажёр для sales closers</p>
        </div>

        {/* Connection status indicator */}
        <div className="flex items-center justify-center gap-2 mb-4 text-xs">
          {connStatus === 'checking' && (
            <span className="flex items-center gap-1.5 text-text-muted">
              <Loader2 className="w-3 h-3 spin" />
              Проверка подключения к серверу...
            </span>
          )}
          {connStatus === 'ok' && (
            <span className="flex items-center gap-1.5 text-success">
              <Wifi className="w-3 h-3" />
              Сервер доступен
            </span>
          )}
          {connStatus === 'fail' && (
            <span className="flex items-center gap-1.5 text-error">
              <WifiOff className="w-3 h-3" />
              Сервер недоступен
            </span>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="flex gap-1 mb-6 p-1 bg-bg-secondary rounded-lg">
            <button
              onClick={() => { setMode('signin'); setError(null); setErrorDetail(null); setInfo(null); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'signin' ? 'bg-bg-tertiary text-accent' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Вход
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); setErrorDetail(null); setInfo(null); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'signup' ? 'bg-bg-tertiary text-accent' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Пароль</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="Минимум 6 символов"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div>{error}</div>
                  {errorDetail && (
                    <div className="mt-1 text-xs text-error/70 font-mono break-all">{errorDetail}</div>
                  )}
                </div>
              </div>
            )}

            {info && (
              <div className="flex items-start gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg p-3">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{info}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 spin" />}
              {mode === 'signin' ? 'Войти' : 'Создать аккаунт'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          Каждый пользователь получает отдельную базу знаний и тренировок.
        </p>
      </div>
    </div>
  );
}
