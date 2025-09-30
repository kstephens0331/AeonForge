// apps/server/src/router.ts
import type { ChatMessage, RouteHints, RouteResult } from "./types.js";
import { togetherChat, togetherChatStream } from "./models/together.js";
import type { ModelAlias } from "./types.js";
import { parseToolCalls, executeTool, generateToolPrompt } from "./tools/index.js";

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

/** --- Non-streaming route with tool support -------------------------- */
export async function routeGenerateWithHistory(
  system: string,
  history: ChatMessage[],
  userText: string,
  hints?: RouteHints
): Promise<RouteResult> {
  const alias = pickAlias(hints, history, userText);
  const maxTokens = hints?.targetWords ? wordsToTokens(hints.targetWords) : undefined;

  // Add tool descriptions to system prompt
  const enableTools = (process.env.ENABLE_TOOLS ?? "true").toLowerCase() === "true";
  const systemWithTools = enableTools ? system + generateToolPrompt() : system;

  // Tool calling loop (max 5 iterations to prevent infinite loops)
  let currentHistory = [...history];
  let currentUserText = userText;
  let finalText = "";
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (let iteration = 0; iteration < 5; iteration++) {
    try {
      const r = await togetherChat(alias, systemWithTools, currentHistory, currentUserText, { maxTokens });
      if (!r.success || !r.text.trim()) break;

      finalText = r.text;
      totalTokensIn += r.tokens_in ?? 0;
      totalTokensOut += r.tokens_out ?? 0;

      // Check for tool calls
      if (!enableTools) break;

      const toolCalls = parseToolCalls(r.text);
      if (toolCalls.length === 0) break;

      // Execute tools
      const toolResults: string[] = [];
      for (const call of toolCalls) {
        const result = await executeTool(call);
        if (result.error) {
          toolResults.push(`Tool ${call.toolName} failed: ${result.error}`);
        } else {
          toolResults.push(`Tool ${call.toolName} result:\n${result.result}`);
        }
      }

      // Add tool results to context and continue
      const toolResponse = toolResults.join("\n\n");
      currentHistory.push({ role: "assistant", content: r.text });
      currentHistory.push({ role: "user", content: `Tool results:\n${toolResponse}\n\nPlease provide your final answer based on these results.` });
      currentUserText = "";
    } catch {
      break;
    }
  }

  if (finalText.trim()) {
    // Remove tool call syntax from final response
    const cleanText = finalText.replace(/<tool>.*?<\/tool>\s*<params>.*?<\/params>/gs, "").trim();
    return {
      provider: "together",
      success: true,
      text: cleanText || finalText,
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut
    };
  }

  return { provider: "echo", success: true, text: "I couldn't reach a model just now, but here's an outline:\n\n" + userText };
}

/** --- Streaming route with retry logic -------------------------------- */
export async function routeGenerateStreamWithMeta(
  system: string,
  history: ChatMessage[],
  userText: string,
  abortSignal: AbortSignal,
  hints?: RouteHints
) {
  const alias = pickAlias(hints, history, userText);
  const maxTokens = hints?.targetWords ? wordsToTokens(hints.targetWords) : undefined;
  const enableTools = (process.env.ENABLE_TOOLS ?? "true").toLowerCase() === "true";
  const systemWithTools = enableTools ? system + generateToolPrompt() : system;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  // Try primary model with retries
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (abortSignal.aborted) break;

    try {
      const s = await togetherChatStream(alias, systemWithTools, history, userText, abortSignal, { maxTokens });

      // Wrap stream with error recovery
      async function* robustStream() {
        let hasYielded = false;
        try {
          for await (const chunk of s.stream) {
            if (abortSignal.aborted) break;
            hasYielded = true;
            yield chunk;
          }
        } catch (streamError: any) {
          // If stream breaks mid-way, log but don't crash
          console.warn(`[router] Stream error on attempt ${attempt + 1}:`, streamError?.message ?? streamError);
          if (!hasYielded) {
            // If we haven't yielded anything yet, throw to trigger retry
            throw streamError;
          }
          // Otherwise, stream already started successfully, just end gracefully
        }
      }

      return { provider: "together" as const, modelId: s.model, stream: robustStream() };
    } catch (e: any) {
      lastError = e;
      console.warn(`[router] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`, e?.message ?? e);

      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES - 1 && !abortSignal.aborted) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
  }

  // All retries failed, try fallback models
  const fallbackAliases: ModelAlias[] = alias === "general"
    ? ["coder", "multilingual"]
    : ["general"];

  for (const fallbackAlias of fallbackAliases) {
    if (abortSignal.aborted) break;

    try {
      console.log(`[router] Trying fallback model: ${fallbackAlias}`);
      const s = await togetherChatStream(fallbackAlias, systemWithTools, history, userText, abortSignal, { maxTokens });

      async function* fallbackStream() {
        try {
          for await (const chunk of s.stream) {
            if (abortSignal.aborted) break;
            yield chunk;
          }
        } catch (streamError: any) {
          console.warn("[router] Fallback stream error:", streamError?.message ?? streamError);
        }
      }

      return { provider: "together" as const, modelId: s.model, stream: fallbackStream() };
    } catch (e: any) {
      console.warn(`[router] Fallback ${fallbackAlias} failed:`, e?.message ?? e);
    }
  }

  // Ultimate fallback: echo
  console.warn("[router] All models failed, using echo fallback");
  async function* gen() {
    yield `I'm having trouble connecting to the AI models right now. Here's what I can outline:\n\n`;
    yield `Based on your question: "${userText.slice(0, 100)}${userText.length > 100 ? "..." : ""}"\n\n`;
    yield `Please try again in a moment, or contact support if the issue persists.`;
  }
  return { provider: "echo" as const, modelId: "echo", stream: gen() };
}
