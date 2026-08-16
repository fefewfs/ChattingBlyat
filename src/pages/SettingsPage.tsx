import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Settings, Loader2, CheckCircle, AlertCircle, Cpu, MessageSquare, Search, Key, Eye, EyeOff } from 'lucide-react';
import type { AISettings } from '@/types';

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter', envName: 'OPENROUTER_API_KEY' },
  { value: 'openai', label: 'OpenAI', envName: 'OPENAI_API_KEY' },
  { value: 'anthropic', label: 'Anthropic', envName: 'ANTHROPIC_API_KEY' },
  { value: 'gemini', label: 'Google Gemini', envName: 'GEMINI_API_KEY' },
  { value: 'mistral', label: 'Mistral', envName: 'MISTRAL_API_KEY' },
  { value: 'deepseek', label: 'DeepSeek', envName: 'DEEPSEEK_API_KEY' },
  { value: 'groq', label: 'Groq', envName: 'GROQ_API_KEY' },
  { value: 'xai', label: 'xAI', envName: 'XAI_API_KEY' },
];

const DEFAULT_SETTINGS = {
  chat_provider: 'openrouter',
  chat_model: 'anthropic/claude-3.5-sonnet',
  embedding_provider: 'openrouter',
  embedding_model: 'openai/text-embedding-3-small',
  reranker_provider: '',
  reranker_model: '',
};

interface UserApiKey {
  id: string;
  key_name: string;
  key_value: string;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [userKeys, setUserKeys] = useState<UserApiKey[]>([]);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedKeys, setSavedKeys] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: settingsData }, { data: keysData }] = await Promise.all([
        supabase.from('ai_settings').select('*').maybeSingle(),
        supabase.from('user_api_keys').select('*'),
      ]);

      setSettings((settingsData as AISettings | null) ?? null);
      const keys = (keysData ?? []) as UserApiKey[];
      setUserKeys(keys);
      const keyMap: Record<string, string> = {};
      for (const k of keys) keyMap[k.key_name] = k.key_value;
      setKeyInputs(keyMap);
      setLoading(false);
    }
    load();
  }, []);

  const current = settings ?? (DEFAULT_SETTINGS as unknown as AISettings);

  const handleSaveSettings = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const updates = {
        chat_provider: current.chat_provider,
        chat_model: current.chat_model,
        embedding_provider: current.embedding_provider,
        embedding_model: current.embedding_model,
        reranker_provider: current.reranker_provider || null,
        reranker_model: current.reranker_model || null,
      };

      if (settings) {
        const { error } = await supabase.from('ai_settings').update(updates).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ai_settings').insert(updates);
        if (error) throw error;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveKeys = async () => {
    setSaving(true);
    setError(null);
    setSavedKeys(false);

    try {
      for (const provider of PROVIDERS) {
        const value = keyInputs[provider.envName]?.trim();
        if (!value) continue;

        const existing = userKeys.find((k) => k.key_name === provider.envName);
        if (existing) {
          const { error } = await supabase
            .from('user_api_keys')
            .update({ key_value: value })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('user_api_keys')
            .insert({ key_name: provider.envName, key_value: value });
          if (error) throw error;
        }
      }

      setSavedKeys(true);
      setTimeout(() => setSavedKeys(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof AISettings, value: string) => {
    setSettings((prev) => ({
      ...(prev ?? (DEFAULT_SETTINGS as unknown as AISettings)),
      [field]: value,
    }) as AISettings);
  };

  const updateKey = (envName: string, value: string) => {
    setKeyInputs((prev) => ({ ...prev, [envName]: value }));
  };

  const toggleShowKey = (envName: string) => {
    setShowKeys((prev) => ({ ...prev, [envName]: !prev[envName] }));
  };

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="text-text-muted text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 spin" /> Загрузка...
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
        <p className="text-text-secondary text-sm mt-1">Конфигурация AI-провайдеров и моделей</p>
      </div>

      <div className="glass-card p-6 mb-4">
        <div className="flex items-center gap-2 mb-5">
          <Key className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">API ключи</h2>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Ключи хранятся в зашифрованной базе данных на сервере и никогда не передаются в браузер.
          Добавьте ключ хотя бы одного провайдера для работы AI.
        </p>
        <div className="space-y-3">
          {PROVIDERS.map((p) => (
            <div key={p.value}>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">{p.label}</label>
              <div className="relative">
                <input
                  type={showKeys[p.envName] ? 'text' : 'password'}
                  value={keyInputs[p.envName] ?? ''}
                  onChange={(e) => updateKey(p.envName, e.target.value)}
                  className="input-field pr-10 font-mono text-xs"
                  placeholder={`Введите ${p.label} API ключ...`}
                />
                <button
                  type="button"
                  onClick={() => toggleShowKey(p.envName)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  {showKeys[p.envName] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSaveKeys} disabled={saving} className="btn-primary flex items-center gap-2 text-xs">
            {saving ? <Loader2 className="w-4 h-4 spin" /> : <Key className="w-4 h-4" />}
            Сохранить ключи
          </button>
          {savedKeys && (
            <span className="text-sm text-success flex items-center gap-1.5 fade-in">
              <CheckCircle className="w-4 h-4" />
              Ключи сохранены
            </span>
          )}
        </div>
      </div>

      <div className="glass-card p-6 mb-4">
        <div className="flex items-center gap-2 mb-5">
          <MessageSquare className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Chat Model</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Провайдер</label>
            <select
              value={current.chat_provider}
              onChange={(e) => update('chat_provider', e.target.value)}
              className="input-field"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Модель</label>
            <input
              value={current.chat_model}
              onChange={(e) => update('chat_model', e.target.value)}
              className="input-field"
              placeholder="anthropic/claude-3.5-sonnet"
            />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 mb-4">
        <div className="flex items-center gap-2 mb-5">
          <Search className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Embedding Model</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Провайдер</label>
            <select
              value={current.embedding_provider}
              onChange={(e) => update('embedding_provider', e.target.value)}
              className="input-field"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Модель</label>
            <input
              value={current.embedding_model}
              onChange={(e) => update('embedding_model', e.target.value)}
              className="input-field"
              placeholder="openai/text-embedding-3-small"
            />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Cpu className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Reranker Model (опционально)</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Провайдер</label>
            <select
              value={current.reranker_provider ?? ''}
              onChange={(e) => update('reranker_provider', e.target.value)}
              className="input-field"
            >
              <option value="">Не использовать</option>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Модель</label>
            <input
              value={current.reranker_model ?? ''}
              onChange={(e) => update('reranker_model', e.target.value)}
              className="input-field"
              placeholder="openai/gpt-4o-mini"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 border-error/20 mb-4">
          <p className="text-sm text-error">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={handleSaveSettings} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 spin" /> : <Settings className="w-4 h-4" />}
          Сохранить настройки
        </button>
        {saved && (
          <span className="text-sm text-success flex items-center gap-1.5 fade-in">
            <CheckCircle className="w-4 h-4" />
            Настройки сохранены
          </span>
        )}
      </div>
    </div>
  );
}
