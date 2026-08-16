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

function chunkText(text: string, maxChunkSize = 1200, overlap = 200): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + " " + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 50);
}

function detectLanguage(text: string): string {
  const russianChars = (text.match(/[а-яёА-ЯЁ]/g) ?? []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (russianChars > englishChars) return "ru";
  if (englishChars > 0) return "en";
  return "unknown";
}

async function extractTextFromContent(content: string, mimeType: string, filename: string): Promise<string> {
  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    return extractTextFromPdf(content);
  }
  if (mimeType.includes("spreadsheet") || filename.endsWith(".xlsx") || filename.endsWith(".csv")) {
    return extractTextFromCsv(content);
  }
  if (mimeType === "application/json" || filename.endsWith(".json")) {
    try {
      const data = JSON.parse(content);
      return JSON.stringify(data, null, 2);
    } catch {
      return content;
    }
  }
  return content;
}

async function extractTextFromPdf(content: string): Promise<string> {
  const textMatches = content.match(/\(([^)]*)\)\s*Tj/g) ?? [];
  const texts = textMatches.map((m) => {
    const match = m.match(/\(([^)]*)\)\s*Tj/);
    return match ? match[1] : "";
  });
  if (texts.length > 0) return texts.join(" ");

  return content
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000);
}

async function extractTextFromCsv(content: string): Promise<string> {
  const lines = content.split(/\n/).slice(0, 500);
  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { sourceId, filePath, mimeType, filename } = body;

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

    const fileResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/knowledge-files/${filePath}`,
      { headers: { Authorization: `Bearer ${supabaseKey}` } },
    );

    if (!fileResponse.ok) {
      await fetch(`${supabaseUrl}/rest/v1/knowledge_sources?id=eq.${sourceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({ status: "error" }),
      });
      return new Response(JSON.stringify({ error: "Не удалось скачать файл" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileContent = await fileResponse.text();
    const extractedText = await extractTextFromContent(fileContent, mimeType, filename);
    const language = detectLanguage(extractedText);
    const chunks = chunkText(extractedText);

    await fetch(`${supabaseUrl}/rest/v1/knowledge_sources?id=eq.${sourceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({ status: "indexing", language }),
    });

    let chunksCreated = 0;
    const batchSize = 5;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await Promise.all(batch.map((c) => generateEmbedding(c, userKeys)));

      const rows = batch.map((content, j) => ({
        source_id: sourceId,
        user_id: userId,
        chunk_index: i + j,
        content,
        embedding: embeddings[j],
        tokens: Math.ceil(content.length / 4),
        metadata: { language, chunk_size: content.length },
      }));

      const insertResponse = await fetch(`${supabaseUrl}/rest/v1/knowledge_chunks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify(rows),
      });

      if (insertResponse.ok) chunksCreated += rows.length;
    }

    await fetch(`${supabaseUrl}/rest/v1/knowledge_sources?id=eq.${sourceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({ status: "ready" }),
    });

    return new Response(JSON.stringify({
      status: "ready",
      chunks_count: chunksCreated,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
