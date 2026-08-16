import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function translateError(message: string): string {
  const m = message.toLowerCase();

  // Network-level failures — the browser gives a generic "Failed to fetch"
  if (m.includes('failed to fetch') || m.includes('network request failed') || m.includes('load failed')) {
    return 'Не удалось подключиться к серверу. Проверьте интернет-соединение или попробуйте позже.';
  }

  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Неверный email или пароль';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'Пользователь уже существует';
  if (m.includes('password should be') || m.includes('password is too short')) return 'Пароль слишком короткий';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Неверный email';
  if (m.includes('email not confirmed') || m.includes('email_address_not_confirmed')) return 'Email не подтверждён. Проверьте почту.';
  if (m.includes('rate limit') || m.includes('too many requests')) return 'Слишком много попыток. Подождите немного.';
  if (m.includes('signup disabled') || m.includes('signups not allowed')) return 'Регистрация отключена';
  if (m.includes('timeout') || m.includes('timed out') || m.includes('aborted')) return 'Сервер не отвечает. Попробуйте позже.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('[Auth] signIn error:', { name: error.name, message: error.message, status: (error as unknown as { status?: number }).status });
        return { error: translateError(error.message) };
      }
      return { error: null };
    } catch (err) {
      console.error('[Auth] signIn exception:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return { error: translateError(msg) };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        console.error('[Auth] signUp error:', { name: error.name, message: error.message, status: (error as unknown as { status?: number }).status });
        return { error: translateError(error.message) };
      }

      // If email confirmation is required, there's no session yet
      if (data.user && !data.session) {
        return { error: null, needsConfirmation: true };
      }

      return { error: null };
    } catch (err) {
      console.error('[Auth] signUp exception:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return { error: translateError(msg) };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
