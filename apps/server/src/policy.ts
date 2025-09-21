import { CFG } from "./config.js";
import type { TogetherModel } from "./providers/togetherCatalog.js";

export type PolicyHints = {
  multilingual?: boolean;
  needsReasoning?: boolean;
  expectedInputTokens?: number;
  expectedOutputTokens?: number;
};

function price(m: TogetherModel) {
  const pin = typeof m.pricing?.prompt === "number" ? m.pricing!.prompt : Infinity;
  const pout = typeof m.pricing?.completion === "number" ? m.pricing!.completion : Infinity;
  return { inTok: pin, outTok: pout };
}

function fitScore(m: TogetherModel, h: PolicyHints): number {
  if (m.modality !== "chat") return -Infinity;
  const { inTok, outTok } = price(m);
  let s = 0;

  // prefer free first
  if (m.free) s += 1000;

  // cheaper is better
  s += -100 * ((inTok || 5e-6) + (outTok || 5e-6));

  // context fit
  const ctx = m.context_length ?? 8000;
  const need = (h.expectedInputTokens ?? 1000) + (h.expectedOutputTokens ?? 800);
  if (ctx >= need) s += 10;
  else s -= 50;

  // multilingual
  if (h.multilingual && m.family !== "qwen" && !m.multilingual) s -= 10;
  if (h.multilingual && (m.family === "qwen" || m.multilingual)) s += 6;

  // reasoning preference (only if allowed)
  if (h.needsReasoning) {
    if (CFG.ALLOW_REASONING && m.reasoning) s += 8;
    else if (!CFG.ALLOW_REASONING && m.reasoning) s -= 20;
  } else {
    if (m.reasoning) s -= 4; // avoid unnecessary expensive reasoning
  }

  // family nudges
  if (m.family === "llama") s += 3;
  if (m.family === "qwen") s += 2;
  if (m.family === "mixtral") s += 1;

  return s;
}

export function chooseCandidates(models: TogetherModel[], hints: PolicyHints, k = 4): TogetherModel[] {
  return models
    .filter((m) => m.modality === "chat")
    .sort((a, b) => fitScore(b, hints) - fitScore(a, hints))
    .slice(0, k);
}
