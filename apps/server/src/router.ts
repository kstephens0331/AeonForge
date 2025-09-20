import { callOllama, callOllamaStream } from "./models/ollama";
import { togetherChat, togetherChatStream } from "./models/together";
import { CFG } from "./config";
import type { RouteResult } from "./types";

/** Non-streaming: local (Ollama) → Together → echo */
export async function routeGenerate(system: string, user: string): Promise<RouteResult> {
  try {
    const prompt = `${system}\n\nUser:\n${user}`;
    return await callOllama(prompt);
  } catch {}
  try {
    if (CFG.TOGETHER_API_KEY) return await togetherChat(system, user);
  } catch {}
  const t0 = Date.now();
  return { provider: "echo", model: "echo", text: `Echo: ${user}`, success: true, latency_ms: Date.now() - t0 };
}

/** Streaming: yields deltas; same routing order; respects AbortSignal */
export async function* routeGenerateStream(
  system: string,
  user: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  // Ollama first
  try {
    const prompt = `${system}\n\nUser:\n${user}`;
    for await (const delta of callOllamaStream(prompt, signal)) {
      yield delta;
    }
    return;
  } catch {}

  // Together next
  try {
    if (CFG.TOGETHER_API_KEY) {
      for await (const delta of togetherChatStream(system, user, CFG.TOGETHER_CHAT_MODEL, signal)) {
        yield delta;
      }
      return;
    }
  } catch {}

  // Echo fallback
  yield `Echo: ${user}`;
}
