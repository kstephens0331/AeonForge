// apps/server/src/models/modelCatalog.ts
// Map high-level aliases -> environment-provided model ids.
// Keep exact model IDs out of client responses.

import type { ModelAlias } from "../types.js";

type Catalog = Record<ModelAlias, string>;

/**
 * Defaults are reasonable Together model IDs.
 * Override via env to rotate without code changes.
 * (We do not expose these to users.)
 */
const DEFAULTS: Catalog = {
  // General assistant with good cost/quality
  general:      "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo",
  // Long-form / larger context
  longform:     "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
  // Deliberate/Thinking tasks
  thinking:     "deepseek-ai/DeepSeek-R1",
  // Code-heavy prompts
  coder:        "qwen/Qwen2.5-Coder-32B-Instruct",
  // Multi-lingual strength
  multilingual: "qwen/Qwen2.5-72B-Instruct-Turbo",
};

const ENV_MAP: Partial<Record<ModelAlias, string>> = {
  general:      process.env.TOGETHER_MODEL_GENERAL ?? "",
  longform:     process.env.TOGETHER_MODEL_LONGFORM ?? "",
  thinking:     process.env.TOGETHER_MODEL_THINKING ?? "",
  coder:        process.env.TOGETHER_MODEL_CODER ?? "",
  multilingual: process.env.TOGETHER_MODEL_MULTILINGUAL ?? "",
};

/**
 * Resolve an alias to its concrete Together model ID.
 */
export function resolveModelId(alias: ModelAlias): string {
  const fromEnv = ENV_MAP[alias];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return DEFAULTS[alias];
}

/**
 * Shim to support legacy imports: moderation.ts calls getModelId().
 * Simply forwards to resolveModelId.
 */
export function getModelId(alias: ModelAlias): string {
  return resolveModelId(alias);
}
