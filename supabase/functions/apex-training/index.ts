import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AIProvider {
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
}

const PROVIDERS: Record<string, AIProvider> = {
  openrouter: { name: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" },
  openai: { name: "openai", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  anthropic: { name: "anthropic", baseUrl: "https://api.anthropic.com/v1", apiKeyEnv: "ANTHROPIC_API_KEY" },
  gemini: { name: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1", apiKeyEnv: "GEMINI_API_KEY" },
  mistral: { name: "mistral", baseUrl: "https://api.mistral.ai/v1", apiKeyEnv: "MISTRAL_API_KEY" },
  deepseek: { name: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKeyEnv: "DEEPSEEK_API_KEY" },
  groq: { name: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY" },
  xai: { name: "xai", baseUrl: "https://api.x.ai/v1", apiKeyEnv: "XAI_API_KEY" },
};

let _cachedGlobalKeys: Record<string, string> | null = null;

async function loadGlobalKeys(): Promise<Record<string, string>> {
  if (_cachedGlobalKeys) return _cachedGlobalKeys;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/app_secrets?select=key_name,key_value`, {
      headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
    });
    if (resp.ok) {
      const rows = await resp.json() as { key_name: string; key_value: string }[];
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key_name] = r.key_value;
      _cachedGlobalKeys = map;
      return map;
    }
  } catch { /* fall through to env */ }
  _cachedGlobalKeys = {};
  return _cachedGlobalKeys;
}

async function loadUserKeys(authHeader: string): Promise<Record<string, string>> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/user_api_keys?select=key_name,key_value`, {
      headers: { Authorization: authHeader, apikey: supabaseKey },
    });
    if (resp.ok) {
      const rows = await resp.json() as { key_name: string; key_value: string }[];
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key_name] = r.key_value;
      return map;
    }
  } catch { /* no user keys */ }
  return {};
}

async function getApiKey(provider: string, userKeys?: Record<string, string>): Promise<string | null> {
  const p = PROVIDERS[provider];
  if (!p) return null;
  if (userKeys && userKeys[p.apiKeyEnv]) return userKeys[p.apiKeyEnv];
  const globalKeys = await loadGlobalKeys();
  return globalKeys[p.apiKeyEnv] ?? Deno.env.get(p.apiKeyEnv) ?? null;
}

async function getProviderForTask(task: string, userKeys?: Record<string, string>): Promise<{ provider: string; model: string }> {
  const taskConfig: Record<string, { provider: string; model: string }> = {
    training: { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" },
    evaluation: { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" },
    extraction: { provider: "openrouter", model: "openai/gpt-4o-mini" },
    classification: { provider: "openrouter", model: "openai/gpt-4o-mini" },
    embeddings: { provider: "openrouter", model: "openai/text-embedding-3-small" },
    reranking: { provider: "openrouter", model: "openai/gpt-4o-mini" },
  };

  const config = taskConfig[task] ?? taskConfig.training;
  const apiKey = await getApiKey(config.provider, userKeys);

  if (!apiKey) {
    for (const [name, _] of Object.entries(PROVIDERS)) {
      const key = await getApiKey(name, userKeys);
      if (key) {
        return { provider: name, model: name === "openrouter" ? "openai/gpt-4o-mini" : "gpt-4o-mini" };
      }
    }
  }

  return config;
}

interface ChatMessage {
  role: string;
  content: string;
}

async function callChat(
  messages: ChatMessage[],
  options: { model?: string; provider?: string; temperature?: number; maxTokens?: number; userKeys?: Record<string, string> } = {},
): Promise<string> {
  const { provider, model } = await getProviderForTask("training", options.userKeys);
  const useProvider = options.provider ?? provider;
  const useModel = options.model ?? model;
  const apiKey = await getApiKey(useProvider, options.userKeys);

  if (!apiKey) {
    throw new Error("Не настроен ни один AI провайдер. Добавьте API ключ в настройках.");
  }

  const p = PROVIDERS[useProvider];
  let url: string;
  let body: Record<string, unknown>;
  let headers: Record<string, string>;

  if (useProvider === "anthropic") {
    url = `${p.baseUrl}/messages`;
    headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages.filter((m) => m.role !== "system");
    body = {
      model: useModel,
      messages: chatMsgs.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      ...(systemMsg ? { system: systemMsg.content } : {}),
    };
  } else if (useProvider === "gemini") {
    url = `${p.baseUrl}/models/${useModel}:generateContent?key=${apiKey}`;
    headers = { "Content-Type": "application/json" };
    body = {
      contents: messages.filter((m) => m.role !== "system").map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: options.temperature ?? 0.7, maxOutputTokens: options.maxTokens ?? 1024 },
    };
  } else {
    url = `${p.baseUrl}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
    if (useProvider === "openrouter") {
      headers["HTTP-Referer"] = "https://apex-closer-os.app";
      headers["X-Title"] = "APEX CLOSER OS";
    }
    body = {
      model: useModel,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI провайдер (${useProvider}) ошибка ${response.status}: ${errText}`);
  }

  const data = await response.json();

  if (useProvider === "anthropic") {
    return data.content?.[0]?.text ?? "";
  } else if (useProvider === "gemini") {
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } else {
    return data.choices?.[0]?.message?.content ?? "";
  }
}

async function callEmbedding(text: string, userKeys?: Record<string, string>): Promise<number[]> {
  const { provider, model } = await getProviderForTask("embeddings", userKeys);
  const apiKey = await getApiKey(provider, userKeys);

  if (!apiKey) {
    return new Array(1536).fill(0);
  }

  const p = PROVIDERS[provider];

  if (provider === "gemini") {
    const url = `${p.baseUrl}/models/${model}:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    });
    if (!response.ok) throw new Error(`Embedding error: ${response.status}`);
    const data = await response.json();
    return data.embedding?.values ?? [];
  }

  const url = `${p.baseUrl}/embeddings`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://apex-closer-os.app" } : {}),
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) throw new Error(`Embedding error: ${response.status}`);
  const data = await response.json();
  return data.data?.[0]?.embedding ?? [];
}

const TRAINING_MODE_CONFIG: Record<string, { label: string; systemPrompt: string }> = {
  live_simulation: {
    label: "Живая симуляция",
    systemPrompt: `Ты играешь роль клиента в симуляции продаж. Веди себя реалистично: 
можешь интересоваться, сомневаться, говорить "дорого", просить скидку, говорить "подумаю",
игнорировать, задавать вопросы, отказываться, возвращаться, менять настроение.
Не давай подсказок. Не показывай правильный ответ. Отвечай кратко, как реальный клиент в чате (1-3 предложения).
Отвечай ТОЛЬКО на русском языке.`,
  },
  objection_training: {
    label: "Тренировка возражений",
    systemPrompt: `Ты играешь роль клиента, который активно выдвигает возражения (цена, время, конкуренты, "подумаю", "не уверен").
Каждое сообщение клиента должно содержать возражение или усиливать предыдущее.
Не принимай ответ сразу. Заставь продавца работать. Отвечай кратко (1-2 предложения).
Отвечай ТОЛЬКО на русском языке.`,
  },
  closing_training: {
    label: "Тренировка закрытия",
    systemPrompt: `Ты играешь роль клиента, который уже заинтересован, но колеблется в финальном моменте.
Ты близок к покупке, но тебе нужен последний толчок. Реагируй на попытки закрытия.
Отвечай кратко (1-2 предложения). Отвечай ТОЛЬКО на русском языке.`,
  },
  discovery_training: {
    label: "Тренировка выявления",
    systemPrompt: `Ты играешь роль клиента, который неохотно делится информацией.
Отвечай на вопросы, но не раскрывай всё сразу. Заставь продавца задавать правильные вопросы.
Иногда давай поверхностные ответы, требующие уточнений. Отвечай кратко (1-2 предложения).
Отвечай ТОЛЬКО на русском языке.`,
  },
  rapport_training: {
    label: "Тренировка раппорта",
    systemPrompt: `Ты играешь роль холодного, закрытого клиента в начале диалога.
Не открывайся сразу. Реагируй сдержанно. Постепенно оттаивай, если продавец строит rapport правильно.
Отвечай кратко (1-2 предложения). Отвечай ТОЛЬКО на русском языке.`,
  },
  followup_training: {
    label: "Тренировка follow-up",
    systemPrompt: `Ты играешь роль клиента, который ранее отказался или сказал "подумаю".
Теперь продавец вернулся к тебе. Ты помнишь предыдущий разговор.
Будь осторожен, но открыт, если follow-up сделан правильно. Отвечай кратко (1-2 предложения).
Отвечай ТОЛЬКО на русском языке.`,
  },
  pressure_test: {
    label: "Стресс-тест",
    systemPrompt: `Ты играешь роль крайне сложного клиента: агрессивного, нетерпеливого, подозрительного.
Меняй настроение резко. Угрожай уйти к конкуренту. Требуй скидку. Критикуй продукт.
Отвечай резко и кратко (1-2 предложения). Отвечай ТОЛЬКО на русском языке.`,
  },
  random_drill: {
    label: "Случайное упражнение",
    systemPrompt: `Ты играешь роль непредсказуемого клиента. Каждое сообщение может менять направление:
то интерес, то возражение, то уход, то возвращение. Будь реалистичен, но непредсказуем.
Отвечай кратко (1-2 предложения). Отвечай ТОЛЬКО на русском языке.`,
  },
};

const CLIENT_PERSONAS = [
  "Малый бизнес, владелец, 40 лет, занятой, ценит время",
  "Руководитель отдела закупок, корпорация, формальный, считает каждый рубль",
  "Стартап-фаундер, 30 лет, энтузиаст, но ограничен в бюджете",
  "Менеджер среднего звена, ищет решение для команды, боится рисковать",
  "Пенсионер, осторожный, долго думает, спрашивает совета у семьи",
  "Опытный клиент, знает рынок, сравнивает с конкурентами",
];

function pickPersona(): string {
  return CLIENT_PERSONAS[Math.floor(Math.random() * CLIENT_PERSONAS.length)];
}

function createSystemPrompt(mode: string, persona: string, skillFocus?: string): string {
  const config = TRAINING_MODE_CONFIG[mode] ?? TRAINING_MODE_CONFIG.live_simulation;
  let prompt = `${config.systemPrompt}\n\nТвой персонаж: ${persona}.`;
  if (skillFocus) {
    prompt += `\n\nОсобый фокус тренировки: ${skillFocus}.`;
  }
  prompt += `\n\nВАЖНО: Первое сообщение должно быть реакцией на обращение продавца. Будь естественен.`;
  return prompt;
}

const SKILL_KEYS = [
  "rapport", "discovery", "qualification", "objection_handling", "value_creation",
  "persuasion", "dialog_control", "closing", "followup", "upsell", "adaptability", "script_selection",
];

const SKILL_LABELS_RU: Record<string, string> = {
  rapport: "Установление контакта",
  discovery: "Выявление потребностей",
  qualification: "Квалификация",
  objection_handling: "Работа с возражениями",
  value_creation: "Создание ценности",
  persuasion: "Убеждение",
  dialog_control: "Контроль диалога",
  closing: "Закрытие",
  followup: "Follow-up",
  upsell: "Upsell",
  adaptability: "Адаптивность",
  script_selection: "Выбор подходящего скрипта",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, mode, skillFocus, sessionId, message } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: supabaseKey },
    });
    if (!userResponse.ok) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = await userResponse.json();
    const userId = user.id;
    const userKeys = await loadUserKeys(authHeader);

    if (action === "start") {
      const persona = pickPersona();
      const systemPrompt = createSystemPrompt(mode ?? "live_simulation", persona, skillFocus);

      const sessionResponse = await fetch(`${supabaseUrl}/rest/v1/training_sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          user_id: userId,
          mode: mode ?? "live_simulation",
          skill_focus: skillFocus ?? null,
          status: "active",
        }),
      });
      const sessions = await sessionResponse.json();
      const session = sessions[0];

      const openingMessage = await callChat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Привет! Я хочу узнать про ваш продукт." },
        ],
        { temperature: 0.8, maxTokens: 256, userKeys },
      );

      await fetch(`${supabaseUrl}/rest/v1/training_messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          session_id: session.id,
          user_id: userId,
          role: "assistant",
          content: openingMessage,
          message_index: 0,
        }),
      });

      return new Response(JSON.stringify({
        session_id: session.id,
        opening_message: openingMessage,
        client_persona: persona,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reply") {
      const messagesResponse = await fetch(
        `${supabaseUrl}/rest/v1/training_messages?session_id=eq.${sessionId}&order=message_index.asc`,
        { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
      );
      const messages = await messagesResponse.json();

      const sessionResponse = await fetch(
        `${supabaseUrl}/rest/v1/training_sessions?id=eq.${sessionId}`,
        { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
      );
      const sessions = await sessionResponse.json();
      const session = sessions[0];

      const persona = "клиент в симуляции продаж";
      const systemPrompt = createSystemPrompt(session.mode, persona, session.skill_focus);

      const chatMessages: ChatMessage[] = [{ role: "system", content: systemPrompt }];
      for (const m of messages) {
        chatMessages.push({ role: m.role, content: m.content });
      }
      chatMessages.push({ role: "user", content: message });

      const reply = await callChat(chatMessages, { temperature: 0.8, maxTokens: 256, userKeys });

      const msgResponse = await fetch(`${supabaseUrl}/rest/v1/training_messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: userId,
          role: "user",
          content: message,
          message_index: messages.length,
        }),
      });
      const userMsgs = await msgResponse.json();

      await fetch(`${supabaseUrl}/rest/v1/training_messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: reply,
          message_index: messages.length + 1,
        }),
      });

      return new Response(JSON.stringify({
        reply,
        message_id: userMsgs[0]?.id ?? null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "finish") {
      const messagesResponse = await fetch(
        `${supabaseUrl}/rest/v1/training_messages?session_id=eq.${sessionId}&order=message_index.asc`,
        { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
      );
      const messages = await messagesResponse.json();

      const sessionResponse = await fetch(
        `${supabaseUrl}/rest/v1/training_sessions?id=eq.${sessionId}`,
        { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
      );
      const sessions = await sessionResponse.json();
      const session = sessions[0];

      const dialog = messages.map((m: { role: string; content: string }) => `[${m.role}]: ${m.content}`).join("\n");

      const evalPrompt = `Проанализируй диалог продавца с клиентом и дай оценку.

Режим тренировки: ${TRAINING_MODE_CONFIG[session.mode]?.label ?? "Симуляция"}

Диалог:
${dialog}

Оцени по 12 навыкам от 0 до 100: ${SKILL_KEYS.map((k) => SKILL_LABELS_RU[k]).join(", ")}.

Верни ответ в формате JSON:
{
  "score": <общая оценка 0-100>,
  "strengths": ["сильная сторона 1", ...],
  "weaknesses": ["слабая сторона 1", ...],
  "missed_opportunities": ["упущенная возможность 1", ...],
  "recommended_alternative": "что продавец мог сказать лучше в конкретный момент",
  "skill_updates": { "rapport": <delta -10..+10>, ... },
  "next_exercise": "рекомендация для следующей тренировки"
}

Ссылайся на конкретные сообщения продавца. Отвечай на русском.`;

      const evalResult = await callChat(
        [{ role: "user", content: evalPrompt }],
        { temperature: 0.3, maxTokens: 1024, userKeys },
      );

      let parsed: Record<string, unknown> = {};
      try {
        const jsonMatch = evalResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = { score: 50, strengths: [], weaknesses: ["Не удалось распарсить оценку"], missed_opportunities: [] };
      }

      const score = Math.max(0, Math.min(100, Number(parsed.score) || 50));
      const skillUpdates = (parsed.skill_updates ?? {}) as Record<string, number>;

      await fetch(`${supabaseUrl}/rest/v1/training_sessions?id=eq.${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          status: "completed",
          score,
          ended_at: new Date().toISOString(),
          summary: parsed.recommended_alternative ?? null,
        }),
      });

      await fetch(`${supabaseUrl}/rest/v1/training_feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: userId,
          strengths: parsed.strengths ?? [],
          weaknesses: parsed.weaknesses ?? [],
          missed_opportunities: parsed.missed_opportunities ?? [],
          recommended_alternative: parsed.recommended_alternative ?? null,
          relevant_source_ids: [],
          next_exercise: parsed.next_exercise ?? null,
        }),
      });

      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/skill_profiles?user_id=eq.${userId}`,
        { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
      );
      const profiles = await profileResponse.json();

      if (profiles.length === 0) {
        const newProfile: Record<string, unknown> = { user_id: userId };
        for (const k of SKILL_KEYS) {
          newProfile[k] = Math.max(0, Math.min(100, 50 + (skillUpdates[k] ?? 0)));
        }
        await fetch(`${supabaseUrl}/rest/v1/skill_profiles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify(newProfile),
        });
      } else {
        const profile = profiles[0];
        const updates: Record<string, number> = {};
        for (const k of SKILL_KEYS) {
          const current = profile[k] ?? 50;
          const delta = skillUpdates[k] ?? 0;
          updates[k] = Math.max(0, Math.min(100, current + delta));
        }
        await fetch(`${supabaseUrl}/rest/v1/skill_profiles?id=eq.${profile.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify(updates),
        });
      }

      return new Response(JSON.stringify({
        score,
        strengths: parsed.strengths ?? [],
        weaknesses: parsed.weaknesses ?? [],
        missed_opportunities: parsed.missed_opportunities ?? [],
        recommended_alternative: parsed.recommended_alternative ?? null,
        relevant_source_ids: [],
        next_exercise: parsed.next_exercise ?? null,
        skill_updates: skillUpdates,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Неизвестное действие" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
