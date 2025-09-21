export const CFG = {
  PORT: Number(process.env.PORT ?? 8787),

    ENABLE_MODERATION: (process.env.ENABLE_MODERATION ?? "true").toLowerCase() === "true",

  // Local-first
  OLLAMA_URL: process.env.OLLAMA_URL ?? "http://localhost:11434",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? "llama3.2:latest",

  // Together
  TOGETHER_BASE_URL: process.env.TOGETHER_BASE_URL ?? "https://api.together.xyz",
  TOGETHER_API_KEY: process.env.TOGETHER_API_KEY ?? "",

  // Default fallbacks if policy can’t pick
  TOGETHER_CHAT_MODEL:
    process.env.TOGETHER_CHAT_MODEL ??
    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  TOGETHER_EMB_MODEL:
    process.env.TOGETHER_EMB_MODEL ??
    "BAAI/bge-large-en-v1.5",

  // Catalog behavior
  CATALOG_TTL_MS: Number(process.env.CATALOG_TTL_MS ?? 5 * 60_000),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "",

  // Routing guardrails
  MAX_INPUT_TOKENS: Number(process.env.MAX_INPUT_TOKENS ?? 8_000),
  MAX_OUTPUT_TOKENS: Number(process.env.MAX_OUTPUT_TOKENS ?? 2_000),
  ALLOW_REASONING: (process.env.ALLOW_REASONING ?? "false").toLowerCase() === "true",

  // Retry/cascading
  TOGETHER_ATTEMPTS: Number(process.env.TOGETHER_ATTEMPTS ?? 3),
  TIMEOUT_MS_LOCAL: Number(process.env.TIMEOUT_MS_LOCAL ?? 45_000),
  TIMEOUT_MS_CLOUD: Number(process.env.TIMEOUT_MS_CLOUD ?? 60_000),

  // Never fail philosophy
  NEVER_FAIL: true,
};
