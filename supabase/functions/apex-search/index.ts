import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROVIDERS: Record<string, { baseUrl: string; apiKeyEnv: string }> = {
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" },
  openai: { baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1", apiKeyEnv: "GEMINI_API_KEY" },
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

async function getProvider(userKeys?: Record<string, string>): Promise<{ provider: string; baseUrl: string; apiKey: string } | null> {
  const globalKeys = await loadGlobalKeys();
  for (const [name, p] of Object.entries(PROVIDERS)) {
    const key = (userKeys?.[p.apiKeyEnv]) ?? globalKeys[p.apiKeyEnv] ?? Deno.env.get(p.apiKeyEnv);
    if (key) return { provider: name, baseUrl: p.baseUrl, apiKey: key };
  }
  return null;
}

async function generateEmbedding(text: string, userKeys?: Record<string, string>): Promise<number[]> {
  const providerInfo = await getProvider(userKeys);
  if (!providerInfo) return new Array(1536).fill(0);

  const { provider, baseUrl, apiKey } = providerInfo;
  const model = "openai/text-embedding-3-small";

  if (provider === "gemini") {
    const url = `${baseUrl}/models/text-embedding-004:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    });
    if (!response.ok) return new Array(1536).fill(0);
    const data = await response.json();
    return data.embedding?.values ?? new Array(1536).fill(0);
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://apex-closer-os.app" } : {}),
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) return new Array(1536).fill(0);
  const data = await response.json();
  return data.data?.[0]?.embedding ?? new Array(1536).fill(0);
}

async function generateExplanation(query: string, content: string, contentRu: string | null, userKeys?: Record<string, string>): Promise<string> {
  const providerInfo = await getProvider(userKeys);
  if (!providerInfo) return contentRu ?? content.slice(0, 200);

  const { provider, baseUrl, apiKey } = providerInfo;
  const model = provider === "openrouter" ? "openai/gpt-4o-mini" : "gpt-4o-mini";

  const prompt = `Объясни на русском языке (1-2 предложения), почему этот фрагмент релевантен запросу.

Запрос: "${query}"

Фрагмент:
${contentRu ?? content}

Ответь только объяснением на русском.`;

  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider === "gemini") {
    url = `${baseUrl}/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    headers = { "Content-Type": "application/json" };
    body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 128 } };
  } else {
    url = `${baseUrl}/chat/completions`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://apex-closer-os.app" } : {}),
    };
    body = { model, messages: [{ role: "user", content: prompt }], max_tokens: 128, temperature: 0.3 };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) return contentRu ?? content.slice(0, 200);
    const data = await response.json();

    if (provider === "gemini") {
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? contentRu ?? "";
    }
    return data.choices?.[0]?.message?.content ?? contentRu ?? "";
  } catch {
    return contentRu ?? content.slice(0, 200);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { query, matchCount, training_context: trainingContext, sessionId } = body;

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

    const embedding = await generateEmbedding(query, userKeys);

    const matchResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/match_chunks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_user_id: userId,
        match_count: matchCount ?? 10,
      }),
    });

    if (!matchResponse.ok) {
      return new Response(JSON.stringify({ error: "Ошибка поиска" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks = await matchResponse.json();

    if (!chunks || chunks.length === 0) {
      await fetch(`${supabaseUrl}/rest/v1/search_history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          user_id: userId,
          query,
          results_count: 0,
          top_result_ids: [],
        }),
      });

      return new Response(JSON.stringify({ results: [], query_ru: query }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sourceIds = [...new Set(chunks.map((c: { source_id: string }) => c.source_id))];
    const sourcesResponse = await fetch(
      `${supabaseUrl}/rest/v1/knowledge_sources?id=in.(${sourceIds.join(",")})`,
      { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
    );
    const sources = await sourcesResponse.json();
    const sourceMap = new Map(sources.map((s: { id: string }) => [s.id, s]));

    const topChunkIds = chunks.slice(0, 5).map((c: { id: string }) => c.id);

    await fetch(`${supabaseUrl}/rest/v1/search_history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({
        user_id: userId,
        query,
        results_count: chunks.length,
        top_result_ids: topChunkIds,
      }),
    });

    const results = await Promise.all(
      chunks.slice(0, matchCount ?? 10).map(async (chunk: {
        id: string; source_id: string; content: string; content_ru: string | null;
        similarity: number; metadata: Record<string, unknown>; chunk_index: number;
      }) => {
        const source = sourceMap.get(chunk.source_id);
        const explanation = await generateExplanation(query, chunk.content, chunk.content_ru, userKeys);

        return {
          chunk_id: chunk.id,
          source_id: chunk.source_id,
          content: chunk.content,
          content_ru: chunk.content_ru,
          similarity: chunk.similarity,
          metadata: chunk.metadata,
          chunk_index: chunk.chunk_index,
          source_filename: source?.filename ?? "",
          source_title: source?.title ?? null,
          explanation_ru: explanation,
        };
      }),
    );

    return new Response(JSON.stringify({ results, query_ru: query }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
