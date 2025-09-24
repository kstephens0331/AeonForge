// apps/server/src/router.ts
import type { ChatMessage, RouteHints, RouteResult } from "./types.js";
import { togetherChat, togetherChatStream } from "./models/together.js";
import type { ModelAlias } from "./types.js";

/** --- Heuristics ------------------------------------------------------- */

function isCoding(text: string): boolean {
  return /```|class\s+\w+|function\s*\(|def\s+\w+|#include|using\s+System|public\s+static|pip install|npm install|SELECT\s+.+\s+FROM/i.test(text);
}

function isThinkingTask(text: string): boolean {
  return /(think step by step|chain of thought|deliberate|prove|derive|reason about|plan out)/i.test(text);
}

function isLongForm(text: string): boolean {
  return /(write (an )?(essay|article|spec|documentation)|long(?:-|\s)?form|comprehensive|detailed explanation)/i.test(text)
      || text.split(/\s+/).length > 180;
}

function isMultilingual(text: string): boolean {
  // crude heuristic: any non-ASCII OR explicit language mention
  return /[^\x00-\x7F]/.test(text) || /(in (spanish|french|german|chinese|arabic|portuguese|hindi))/i.test(text);
}

function pickAlias(hints: RouteHints | undefined, history: ChatMessage[], userText: string): ModelAlias {
  const blob = history.map(m => m.content).join("\n") + "\n" + userText;

  if (hints?.mode === "coding" || isCoding(blob))          return "coder";
  if (isThinkingTask(blob))                                 return "thinking";
  if (isLongForm(blob) || (hints?.targetWords ?? 0) > 600)  return "longform";
  if (isMultilingual(blob))                                 return "multilingual";
  return "general";
}

function wordsToTokens(words: number): number {
  const w = Math.max(100, Math.min(20000, Math.floor(words)));
  return Math.min(32000, Math.floor(w * 1.25));
}

/** --- Non-streaming route --------------------------------------------- */
export async function routeGenerateWithHistory(
  system: string,
  history: ChatMessage[],
  userText: string,
  hints?: RouteHints
): Promise<RouteResult> {
  const alias = pickAlias(hints, history, userText);
  const maxTokens = hints?.targetWords ? wordsToTokens(hints.targetWords) : undefined;

  try {
    const r = await togetherChat(alias, system, history, userText, { maxTokens });
    if (r.success && r.text.trim()) {
      return { provider: "together", success: true, text: r.text, model: r.model, tokens_in: r.tokens_in, tokens_out: r.tokens_out };
    }
  } catch {
    // fall through
  }
  return { provider: "echo", success: true, text: "I couldn’t reach a model just now, but here’s an outline:\n\n" + userText };
}

/** --- Streaming route -------------------------------------------------- */
export async function routeGenerateStreamWithMeta(
  system: string,
  history: ChatMessage[],
  userText: string,
  abortSignal: AbortSignal,
  hints?: RouteHints
) {
  const alias = pickAlias(hints, history, userText);
  const maxTokens = hints?.targetWords ? wordsToTokens(hints.targetWords) : undefined;

  try {
    const s = await togetherChatStream(alias, system, history, userText, abortSignal, { maxTokens });
    return { provider: "together" as const, modelId: s.model, stream: s.stream };
  } catch {
    async function* gen() { yield "Let me outline the steps:\n1) " + userText; }
    return { provider: "echo" as const, modelId: "echo", stream: gen() };
  }
}
