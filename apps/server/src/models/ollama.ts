import { CFG } from "../config";
import type { RouteResult } from "../types";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

export async function callOllama(prompt: string): Promise<RouteResult> {
  const t0 = Date.now();
  const res = await withTimeout(
    fetch(`${CFG.OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CFG.OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2 },
      }),
    }),
    CFG.TIMEOUT_MS_LOCAL
  );

  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const data = (await res.json()) as { response?: string };
  const text = (data.response ?? "").trim();

  return {
    provider: "ollama",
    model: CFG.OLLAMA_MODEL,
    text,
    success: true,
    latency_ms: Date.now() - t0,
  };
}

/** Streaming generator of text deltas from Ollama */
export async function* callOllamaStream(
  prompt: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${CFG.OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CFG.OLLAMA_MODEL,
      prompt,
      stream: true,
      options: { temperature: 0.2 },
    }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`ollama ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      // Ollama streams JSON lines (newline-delimited)
      for (const line of chunk.split("\n")) {
        const s = line.trim();
        if (!s) continue;
        try {
          const obj = JSON.parse(s) as { response?: string; done?: boolean };
          if (obj.response) yield obj.response;
        } catch {
          // ignore parse errors on partial lines
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}
