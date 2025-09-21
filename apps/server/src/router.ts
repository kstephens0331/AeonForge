// apps/server/src/router.ts
// Together-only router (NodeNext ESM). No Ollama, no catalog/policy cascade.

import type { RouteResult } from "./types.js";

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY!;
const TOGETHER_MODEL =
  process.env.TOGETHER_MODEL ?? "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo";
const MAX_TOKENS = Number(process.env.SEGMENT_MAX_TOKENS ?? 4096);
const TEMP = Number(process.env.TOGETHER_TEMPERATURE ?? 0.2);
const TOP_P = Number(process.env.TOGETHER_TOP_P ?? 0.9);

function stripThink(s: string) {
  return s.replace(/<think>[\s\S]*?<\/think>/g, "");
}

/** One-shot completion (non-streaming) */
export async function routeGenerate(system: string, user: string): Promise<RouteResult> {
  const t0 = Date.now();

  if (!TOGETHER_API_KEY) {
    return {
      provider: "together",
      model: TOGETHER_MODEL,
      text: "Server missing TOGETHER_API_KEY.",
      success: false,
      latency_ms: Date.now() - t0,
    };
    }

  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOGETHER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TOGETHER_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: TEMP,
      top_p: TOP_P,
      max_tokens: MAX_TOKENS,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      provider: "together",
      model: TOGETHER_MODEL,
      text: `Together HTTP ${res.status}: ${body || "request failed"}`,
      success: false,
      latency_ms: Date.now() - t0,
    };
  }

  const j = await res.json();
  const content: string =
    j?.choices?.[0]?.message?.content ??
    j?.choices?.[0]?.text ??
    "";
  const usage = j?.usage ?? {};

  return {
    provider: "together",
    model: TOGETHER_MODEL,
    text: stripThink(content || ""),
    success: true,
    tokens_in: usage?.prompt_tokens,
    tokens_out: usage?.completion_tokens,
    latency_ms: Date.now() - t0,
  };
}

/** Internal: Together streaming generator */
async function* togetherStream(system: string, user: string, signal?: AbortSignal) {
  if (!TOGETHER_API_KEY) {
    throw new Error("TOGETHER_API_KEY missing");
  }

  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOGETHER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TOGETHER_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: TEMP,
      top_p: TOP_P,
      max_tokens: MAX_TOKENS,
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Together stream HTTP ${res.status}: ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    carry += chunk;

    // Parse Server-Sent Events frames: blocks separated by "\n\n"
    for (;;) {
      const idx = carry.indexOf("\n\n");
      if (idx === -1) break;
      const block = carry.slice(0, idx);
      carry = carry.slice(idx + 2);

      for (const line of block.split("\n")) {
        const s = line.trim();
        if (!s || s.startsWith(":")) continue;   // comments/heartbeats
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const j = JSON.parse(payload);
          const piece: string =
            j?.choices?.[0]?.delta?.content ??
            j?.choices?.[0]?.text ??
            "";
          if (piece) yield stripThink(piece);
        } catch {
          // ignore parse errors for malformed frames
        }
      }
    }
  }
}

/** Streaming with meta (matches existing server usage) */
export async function routeGenerateStreamWithMeta(
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<{
  provider: "together";
  modelId: string;
  stream: AsyncGenerator<string>;
}> {
  const stream = togetherStream(system, user, signal);
  return { provider: "together", modelId: TOGETHER_MODEL, stream };
}
