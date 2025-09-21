import { CFG } from "../config";
import type { RouteResult } from "../types";

/**
 * Together.ai (OpenAI-compatible) client
 * Endpoints:
 *  - POST /v1/chat/completions      (chat & stream)
 *  - POST /v1/embeddings            (embeddings)
 */

const BASE = CFG.TOGETHER_BASE_URL.replace(/\/+$/, "");

function authHeaders() {
  if (!CFG.TOGETHER_API_KEY) throw new Error("Together API key missing");
  return {
    Authorization: `Bearer ${CFG.TOGETHER_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// ---------- Chat (non-stream) ----------
export async function togetherChat(
  system: string,
  user: string,
  modelId = CFG.TOGETHER_CHAT_MODEL
): Promise<RouteResult> {
  const url = `${BASE}/v1/chat/completions`;
  const t0 = Date.now();

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`together chat ${res.status}: ${body}`);
  }

  const data = await res.json();

  const text: string =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.delta?.content ??
    "";

  // Usage (tokens) is often included on non-stream calls
  const tokens_in: number | undefined = data?.usage?.prompt_tokens;
  const tokens_out: number | undefined = data?.usage?.completion_tokens;

  return {
    provider: "together",
    model: modelId,
    text,
    success: true,
    latency_ms: Date.now() - t0,
    tokens_in,
    tokens_out,
  };
}

// ---------- Chat (stream) ----------
export async function* togetherChatStream(
  system: string,
  user: string,
  modelId = CFG.TOGETHER_CHAT_MODEL,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const url = `${BASE}/v1/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await safeText(res);
    throw new Error(`together stream ${res.status}: ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  // Together streams Server-Sent Events (like OpenAI)
  // Lines prefixed with "data: {json}" until "data: [DONE]"
  try {
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);

        if (!line || !line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;

        try {
          const obj = JSON.parse(payload);
          const delta: string =
            obj?.choices?.[0]?.delta?.content ??
            obj?.choices?.[0]?.message?.content ??
            "";
          if (delta) yield String(delta);
        } catch {
          // ignore malformed frames
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

// ---------- Embeddings ----------
export async function togetherEmbed(texts: string[]): Promise<number[][]> {
  // Batch-friendly (Together accepts array input)
  if (!texts?.length) return [];
  const url = `${BASE}/v1/embeddings`;

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: CFG.TOGETHER_EMB_MODEL,
      input: texts,
    }),
  });

  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`together embed ${res.status}: ${body}`);
  }

  const data = await res.json();
  const arr: number[][] = (data?.data ?? []).map((d: any) => d?.embedding ?? []);
  return arr;
}

// ---------- utils ----------
async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
