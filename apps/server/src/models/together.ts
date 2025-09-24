// apps/server/src/models/together.ts
// Together API wrapper (OpenAI-compatible chat + embeddings). Supports non-stream + stream.

import type { ChatMessage, TogetherOptions, RouteResult } from "../types.js";
import { resolveModelId } from "./modelCatalog.js";

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY ?? "";
const TOGETHER_BASE_URL = (process.env.TOGETHER_BASE_URL ?? "https://api.together.xyz").replace(/\/+$/, "");
if (!TOGETHER_API_KEY) {
  console.warn("[together] Missing TOGETHER_API_KEY; requests will fail open to echo");
}

type OpenAIChatMessage = { role: "system" | "user" | "assistant"; content: string };

function toOpenAIMessages(system: string, history: ChatMessage[], userText: string): OpenAIChatMessage[] {
  const msgs: OpenAIChatMessage[] = [];
  if (system) msgs.push({ role: "system", content: system });
  for (const m of history) msgs.push({ role: m.role, content: m.content });
  msgs.push({ role: "user", content: userText });
  return msgs;
}

type TogetherUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

type TogetherNonStreamResp = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: { index: number; message: { role: "assistant"; content: string }; finish_reason: string }[];
  usage?: TogetherUsage;
};

type StreamChunkChoice = {
  index: number;
  delta?: { content?: string; role?: "assistant" };
  finish_reason: string | null;
};
type TogetherStreamEvent = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: StreamChunkChoice[];
  usage?: TogetherUsage;
};

async function postJSON(path: string, body: any, signal?: AbortSignal): Promise<Response> {
  const url = `${TOGETHER_BASE_URL}/v1${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOGETHER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}

/** Non-streaming chat completion through Together. */
export async function togetherChat(
  alias: string,
  system: string,
  history: ChatMessage[],
  userText: string,
  opts?: TogetherOptions
): Promise<RouteResult> {
  const modelId = resolveModelId(alias as any);
  const messages = toOpenAIMessages(system, history, userText);

  const body = {
    model: modelId,
    messages,
    temperature: opts?.temperature ?? 0.2,
    top_p: opts?.top_p ?? 0.95,
    max_tokens: opts?.maxTokens ?? 1024,
    stream: false,
  };

  try {
    const res = await postJSON("/chat/completions", body);
    if (!res.ok) throw new Error(`Together HTTP ${res.status}`);
    const json: TogetherNonStreamResp = await res.json();
    const text = json.choices?.[0]?.message?.content ?? "";
    const usage = json.usage ?? {};
    return {
      provider: "together",
      success: true,
      text,
      model: json.model,
      tokens_in: usage.prompt_tokens,
      tokens_out: usage.completion_tokens,
    };
  } catch {
    return { provider: "echo", success: true, text: "Let me outline the approach:\n\n" + userText };
  }
}

/** Streaming chat completion through Together. */
export async function togetherChatStream(
  alias: string,
  system: string,
  history: ChatMessage[],
  userText: string,
  signal: AbortSignal,
  opts?: TogetherOptions
): Promise<{ model: string; stream: AsyncIterable<string> }> {
  const modelId = resolveModelId(alias as any);
  const messages = toOpenAIMessages(system, history, userText);

  const body = {
    model: modelId,
    messages,
    temperature: opts?.temperature ?? 0.2,
    top_p: opts?.top_p ?? 0.95,
    max_tokens: opts?.maxTokens ?? 1024,
    stream: true,
  };

  const res = await postJSON("/chat/completions", body, signal);
  if (!res.ok || !res.body) {
    async function* gen() { yield "Let me outline the steps:\n1) " + userText; }
    return { model: modelId, stream: gen() };
  }

  // Together streams as OpenAI-style SSE: "data: {json}\n\n"
  async function* readStream(): AsyncIterable<string> {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;

          if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") return;
            try {
              const obj: TogetherStreamEvent = JSON.parse(payload);
              const parts = obj.choices ?? [];
              for (const ch of parts) {
                const frag = ch.delta?.content ?? "";
                if (frag) yield frag;
              }
            } catch { /* ignore malformed chunk */ }
          }
        }
      }

      // flush any trailing buffer
      if (buffer.startsWith("data:")) {
        const payload = buffer.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          try {
            const obj: TogetherStreamEvent = JSON.parse(payload);
            const parts = obj.choices ?? [];
            for (const ch of parts) {
              const frag = ch.delta?.content ?? "";
              if (frag) yield frag;
            }
          } catch { /* ignore */ }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  return { model: modelId, stream: readStream() };
}

/** -------- Embeddings (new) --------
 * Batch-embeds texts. Uses env override if provided; otherwise a solid default.
 * Returns an array of float vectors (number[]).
 */
export async function togetherEmbed(
  texts: string[],
  opts?: { modelId?: string }
): Promise<number[][]> {
  if (!texts.length) return [];

  const modelId =
    opts?.modelId?.trim() ||
    (process.env.TOGETHER_MODEL_EMBEDDING ?? "").trim() ||
    // Good defaults available on Together:
    "BAAI-Bge-Large-1.5";

  const body = {
    model: modelId,
    input: texts,
  };

  const res = await postJSON("/embeddings", body);
  if (!res.ok) throw new Error(`Together embeddings HTTP ${res.status}`);

  type EmbResp = { data: { embedding: number[] }[]; model: string; object: string };
  const json: EmbResp = await res.json();
  return (json.data ?? []).map((d) => d.embedding);
}
