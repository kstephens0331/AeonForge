export const CFG = {
  // Local-first LLM (Ollama)
  OLLAMA_URL: process.env.OLLAMA_URL ?? "http://localhost:11434",
  // Pick the exact tag you’ll actually pull later; example below is 7B instruct quantized
  OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? "llama3.2:7b-instruct-q4_K_M",

  // Together.ai (single key covers chat/embeddings/images/audio/moderation)
  TOGETHER_API_KEY: process.env.TOGETHER_API_KEY ?? "",
  TOGETHER_BASE_URL: process.env.TOGETHER_BASE_URL ?? "https://api.together.xyz",

  // Default Together models (change via env anytime)
  TOGETHER_CHAT_MODEL:
    process.env.TOGETHER_CHAT_MODEL ?? "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  TOGETHER_EMB_MODEL:
    process.env.TOGETHER_EMB_MODEL ?? "togethercomputer/m2-bert-80M-8k-retrieval", // 768-dim
  TOGETHER_MOD_MODEL:
    process.env.TOGETHER_MOD_MODEL ?? "meta-llama/Llama-Guard-3-8B", // used via chat
  TOGETHER_TTS_MODEL: process.env.TOGETHER_TTS_MODEL ?? "cartesia/sonic-english",
  TOGETHER_ASR_MODEL: process.env.TOGETHER_ASR_MODEL ?? "openai/whisper-large-v3",
  TOGETHER_IMAGE_MODEL: process.env.TOGETHER_IMAGE_MODEL ?? "black-forest-labs/FLUX.1-dev",

  // RAG
  RAG_TOP_K: Number(process.env.RAG_TOP_K ?? 4),
  RAG_MIN_CHARS: Number(process.env.RAG_MIN_CHARS ?? 400),

  // Safety timeouts
  TIMEOUT_MS_LOCAL: Number(process.env.TIMEOUT_MS_LOCAL ?? 12000),
  TIMEOUT_MS_CLOUD: Number(process.env.TIMEOUT_MS_CLOUD ?? 15000),
};
