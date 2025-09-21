import { callOllama, callOllamaStream } from "./models/ollama.js";
import { togetherChat, togetherChatStream } from "./models/together.js";
import { CFG } from "./config.js";
import type { RouteResult } from "./types.js";
import { chooseCandidates, type PolicyHints } from "./policy.js";
import { getCatalog } from "./providers/togetherCatalog.js";

function estTokens(s: string) {
  return Math.ceil((s ?? "").length / 4);
}

function clampPrompt(system: string, user: string) {
  const inTok = estTokens(system) + estTokens(user);
  if (inTok <= CFG.MAX_INPUT_TOKENS) return { system, user };
  const keep = Math.floor((CFG.MAX_INPUT_TOKENS * 3) / 4);
  const sys =
    "You are AeonForge. The user message may be truncated for brevity. Answer helpfully.";
  const cutUser = user.slice(-keep);
  return { system: sys, user: cutUser };
}

async function togetherCandidates(
  system: string,
  user: string,
  overrides?: Partial<PolicyHints>
) {
  if (!CFG.TOGETHER_API_KEY) return [];
  const models = await getCatalog(false);
  const hints: PolicyHints = {
    multilingual: /[^\u0000-\u007f]/.test(user),
    needsReasoning: /\bwhy|explain step|prove|math|logic|reason\b/i.test(user),
    expectedInputTokens: Math.min(
      CFG.MAX_INPUT_TOKENS,
      estTokens(system) + estTokens(user)
    ),
    expectedOutputTokens: Math.min(CFG.MAX_OUTPUT_TOKENS, 800),
    ...overrides,
  };
  const cands = chooseCandidates(models, hints, CFG.TOGETHER_ATTEMPTS + 2);
  // prefer free → cheaper
  return cands
    .sort((a, b) => {
      const af = a.free ? 0 : 1,
        bf = b.free ? 0 : 1;
      if (af !== bf) return af - bf;
      const ap =
        (a.pricing?.prompt ?? 1e-5) + (a.pricing?.completion ?? 1e-5);
      const bp =
        (b.pricing?.prompt ?? 1e-5) + (b.pricing?.completion ?? 1e-5);
      return ap - bp;
    })
    .slice(0, CFG.TOGETHER_ATTEMPTS);
}

// ---------- Non-streaming main entry ----------
export async function routeGenerate(
  system: string,
  user: string
): Promise<RouteResult> {
  const { system: sys, user: usr } = clampPrompt(system, user);

  // 1) Local-first (Ollama)
  try {
    const prompt = `${sys}\n\nUser:\n${usr}`;
    return await callOllama(prompt);
  } catch {
    // continue to cloud
  }

  // 2) Together cascade
  try {
    const cands = await togetherCandidates(sys, usr);
    for (const m of cands) {
      try {
        const r = await togetherChat(sys, usr, m.id);
        return r;
      } catch {
        // try next candidate
      }
    }
  } catch {
    // ignore
  }

  // 3) Echo fallback — never fail
  const t0 = Date.now();
  return {
    provider: "echo",
    model: "echo",
    text: `Echo: ${usr}`,
    success: true,
    latency_ms: Date.now() - t0,
  };
}

// ---------- Streaming main entry (with meta) ----------
export async function routeGenerateStreamWithMeta(
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<{
  provider: "local" | "together" | "echo";
  modelId?: string;
  stream: AsyncGenerator<string>;
}> {
  const { system: sys, user: usr } = clampPrompt(system, user);

  // 1) Local stream
  try {
    const prompt = `${sys}\n\nUser:\n${usr}`;
    const stream = callOllamaStream(prompt, signal);
    return { provider: "local", stream };
  } catch {
    // continue
  }

  // 2) Together stream (choose best now so we can price it later)
  try {
    const cands = await togetherCandidates(sys, usr);
    for (const m of cands) {
      try {
        const stream = togetherChatStream(sys, usr, m.id, signal);
        return { provider: "together", modelId: m.id, stream };
      } catch {
        // next
      }
    }
  } catch {
    // ignore
  }

  // 3) Echo stream
  async function* echoGen() {
    yield `Echo: ${usr}`;
  }
  return { provider: "echo", stream: echoGen() };
}
