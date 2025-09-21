import { CFG } from "../config";
import type { RouteResult } from "../types";

/**
 * Ollama HTTP API helpers
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 *
 * We use:
 * - POST /api/generate        (text generation; stream or non-stream)
 * - POST /api/embeddings      (embeddings)
 *
 * We keep it prompt-based (generate) instead of chat for maximum compatibility.
 */

const BASE = CFG.OLLAMA_URL.replace(/\/+$/, "");

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

/** Non-streaming call to Ollama /api/generate */
export async function callOllama(prompt: string): Promise<RouteResult> {
  const url = `${BASE}/api/generate`;
  const t0 = Date.now();

  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        model: CFG.OLLAMA_MODEL,
        prompt,
        stream: false,
        // conservative defaults; adjust if you want spicier output
        temperature: 0.2,
      }),
    }),
    CFG.TIMEOUT_MS_LOCAL
  );

  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`ollama-generate ${res.status}: ${body}`);
  }

  // Example response:
  // {
  //   "model":"llama3:instruct",
  //   "created_at":"...",
  //   "response":"...full text...",
  //   "done":true,
  //   "total_duration": 1234567,
  //   "load_duration": 1234,
  //   "prompt_eval_count": 100,
  //   "eval_count": 120
  // }
  const data = await res.json();

  const text: string = data?.response ?? "";
  const tokens_in: number | undefined = data?.prompt_eval_count;
  const tokens_out: number | undefined = data?.eval_count;

  return {
    provider: "local",
    model: CFG.OLLAMA_MODEL,
    text,
    success: true,
    latency_ms: Date.now() - t0,
    tokens_in,
    tokens_out,
  };
}

/**
 * Streaming call to Ollama /api/generate
 * The endpoint streams JSONL with fields like:
 * { "response": "partial", "done": false }
 * ... final:
 * { "done": true, "prompt_eval_count": ..., "eval_count": ... }
 *
 * We yield ONLY the incremental "response" chunks as plain text.
 */
export async function* callOllamaStream(
  prompt: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const url = `${BASE}/api/generate`;

  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      model: CFG.OLLAMA_MODEL,
      prompt,
      stream: true,
      temperature: 0.2,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await safeText(res);
    throw new Error(`ollama-stream ${res.status}: ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  try {
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // The stream is JSON objects separated by newlines.
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);

        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj?.response) {
            yield String(obj.response);
          }
          if (obj?.done) {
            return;
          }
        } catch {
          // ignore malformed partial lines
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/** Embeddings via Ollama /api/embeddings. Returns number[][] */
export async function ollamaEmbed(texts: string[]): Promise<number[][]> {
  const url = `${BASE}/api/embeddings`;

  // Ollama accepts one input at a time; batch client-side
  const out: number[][] = [];
  for (const input of texts) {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          model: CFG.OLLAMA_MODEL, // you can point this to a specific embedding model if you run one locally
          prompt: input,
        }),
      }),
      CFG.TIMEOUT_MS_LOCAL
    );

    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(`ollama-embed ${res.status}: ${body}`);
    }
    // { "embedding": [ ...numbers ] }
    const data = await res.json();
    if (!Array.isArray(data?.embedding)) throw new Error("ollama-embed invalid response");
    out.push(data.embedding as number[]);
  }
  return out;
}

// ---------- utils ----------
async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}
