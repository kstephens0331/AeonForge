import { CFG } from "../config";
import type { RouteResult } from "../types";

const BASE = CFG.TOGETHER_BASE_URL;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

function authHeaders(json = true) {
  if (!CFG.TOGETHER_API_KEY) throw new Error("together-missing-key");
  const h: Record<string, string> = { Authorization: `Bearer ${CFG.TOGETHER_API_KEY}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export async function togetherChat(
  system: string,
  user: string,
  model = CFG.TOGETHER_CHAT_MODEL
): Promise<RouteResult> {
  const t0 = Date.now();
  const res = await withTimeout(
    fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
      }),
    }),
    CFG.TIMEOUT_MS_CLOUD
  );
  if (!res.ok) throw new Error(`together-chat ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim?.() ?? "";

  return {
    provider: "together",
    model,
    text,
    success: true,
    latency_ms: Date.now() - t0,
    tokens_in: data?.usage?.prompt_tokens,
    tokens_out: data?.usage?.completion_tokens,
  };
}

/** Streaming generator of text deltas from Together (OpenAI-compatible stream) */
export async function* togetherChatStream(
  system: string,
  user: string,
  model = CFG.TOGETHER_CHAT_MODEL,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  if (!CFG.TOGETHER_API_KEY) throw new Error("together-missing-key");

  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      stream: true,
    }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`together-chat ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  try {
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // OpenAI-compatible: lines starting with "data: {json}"
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep tail for next read

      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]") return;

        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content ?? "";
          if (delta) yield delta as string;
        } catch {
          // ignore malformed split lines
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/** Embeddings + (optional) moderation stubs kept from earlier */
export async function togetherEmbed(texts: string[], model = CFG.TOGETHER_EMB_MODEL): Promise<number[][]> {
  const res = await withTimeout(
    fetch(`${BASE}/v1/embeddings`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ model, input: texts }),
    }),
    CFG.TIMEOUT_MS_CLOUD
  );
  if (!res.ok) throw new Error(`together-embed ${res.status}`);
  const data = await res.json();
  return (data?.data ?? []).map((d: any) => d?.embedding as number[]);
}

export async function togetherModerate(_text: string): Promise<{ allowed: boolean; label?: string }> {
  return { allowed: true };
}

export async function togetherImage(_prompt: string): Promise<string> { return ""; }
export async function togetherTTS(_text: string): Promise<ArrayBuffer> { return new ArrayBuffer(0); }
export async function togetherASR(_audio: ArrayBuffer): Promise<string> { return ""; }
