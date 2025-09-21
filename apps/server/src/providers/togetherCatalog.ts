import { CFG } from "../config";

export type TogetherModel = {
  id: string;
  context_length?: number;
  modality?: "chat" | "embed" | "image" | "audio" | "moderation" | "other";
  pricing?: { prompt?: number; completion?: number; cached_prompt?: number; image?: number; audio?: number };
  family?: "llama" | "qwen" | "mixtral" | "gemma" | "deepseek" | "other";
  multilingual?: boolean;
  reasoning?: boolean;
  free?: boolean; // derived
};

// ---- Manual library (from your lists) ----
// Pricing is $ per 1M tokens where applicable. “Free” is flagged.
// For brevity, this has the most frequently used items; add more anytime.
const MANUAL_LIBRARY: Record<string, Partial<TogetherModel>> = {
  // Free/cheap first
  "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo-Free": { modality: "chat", family: "llama", pricing: { prompt: 0, completion: 0 }, free: true },
  "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free": { modality: "chat", family: "deepseek", pricing: { prompt: 0, completion: 0 }, free: true },

  // Popular efficient baselines
  "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo": { modality: "chat", family: "llama", pricing: { prompt: 0.18e6, completion: 0.18e6 } }, // will be normalized below
  "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo": { modality: "chat", family: "llama", pricing: { prompt: 0.88e6, completion: 0.88e6 } },
  "mistralai/Mistral-7B-Instruct-v0.3": { modality: "chat", family: "mixtral", pricing: { prompt: 0.20e6, completion: 0.20e6 } },
  "mistralai/Mixtral-8x7B-Instruct-v0.1": { modality: "chat", family: "mixtral", pricing: { prompt: 0.60e6, completion: 0.60e6 } },
  "Qwen/Qwen2.5-7B-Instruct-Turbo": { modality: "chat", family: "qwen", pricing: { prompt: 0.30e6, completion: 0.30e6 }, multilingual: true },
  "Qwen/Qwen2.5-72B-Instruct-Turbo": { modality: "chat", family: "qwen", pricing: { prompt: 1.20e6, completion: 1.20e6 }, multilingual: true },

  // Reasoning / thinking lines
  "deepseek-ai/DeepSeek-R1-0528": { modality: "chat", family: "deepseek", reasoning: true, pricing: { prompt: 3.00e6, completion: 7.00e6 } },
  "Qwen/Qwen3-235B-A22B-Thinking-2507-FP8": { modality: "chat", family: "qwen", reasoning: true, pricing: { prompt: 0.65e6, completion: 3.00e6 } },
  "Qwen/Qwen3-Next-80B-A3b-Thinking": { modality: "chat", family: "qwen", reasoning: true, pricing: { prompt: 0.15e6, completion: 1.50e6 } },

  // Vision & multi (kept for future)
  "meta-llama/Llama-4-Maverick-Instruct-17Bx128E": { modality: "chat", family: "llama", pricing: { prompt: 0.27e6, completion: 0.85e6 } },
  "Qwen/Qwen2.5-VL-72B-Instruct": { modality: "chat", family: "qwen", pricing: { prompt: 1.95e6, completion: 8.00e6 }, multilingual: true },

  // Embeddings
  "BAAI/bge-large-en-v1.5": { modality: "embed", pricing: { prompt: 0.02e6 } },
  "intfloat/multilingual-e5-large-instruct": { modality: "embed", pricing: { prompt: 0.02e6 }, multilingual: true },
  "Alibaba-NLP/gte-modernbert-base": { modality: "embed", pricing: { prompt: 0.08e6 } },
  "togethercomputer/m2-bert-retrieval-32k": { modality: "embed", pricing: { prompt: 0.01e6 } },

  // Moderation
  "meta-llama/Llama-Guard-4-12B": { modality: "moderation", family: "llama", pricing: { prompt: 0.20e6 } },
  "meta-llama/Llama-Guard-3-8B": { modality: "moderation", family: "llama", pricing: { prompt: 0.20e6 } },
  "meta-llama/Llama-Guard-3-11B-Vision-Turbo": { modality: "moderation", family: "llama", pricing: { prompt: 0.18e6 } },
  "VirtueAI/VirtueGuard-Text-Lite": { modality: "moderation", pricing: { prompt: 0.20e6 } },
};

// normalize $ values: list above pasted with $/1M → here they were multiplied wrong (0.18e6). Fix:
for (const v of Object.values(MANUAL_LIBRARY)) {
  if (v.pricing?.prompt && v.pricing.prompt > 1000) v.pricing.prompt = v.pricing.prompt / 1_000_000;
  if (v.pricing?.completion && v.pricing.completion > 1000) v.pricing.completion = v.pricing.completion / 1_000_000;
}

function familyFromId(id: string): TogetherModel["family"] {
  const s = id.toLowerCase();
  if (s.includes("llama")) return "llama";
  if (s.includes("qwen")) return "qwen";
  if (s.includes("mixtral")) return "mixtral";
  if (s.includes("gemma")) return "gemma";
  if (s.includes("deepseek")) return "deepseek";
  return "other";
}

function modalityFromId(id: string): TogetherModel["modality"] {
  const s = id.toLowerCase();
  if (s.includes("embed")) return "embed";
  if (s.includes("whisper") || s.includes("asr") || s.includes("audio")) return "audio";
  if (s.includes("flux") || s.includes("image")) return "image";
  if (s.includes("guard") || s.includes("moderation")) return "moderation";
  if (s.includes("llama") || s.includes("qwen") || s.includes("mixtral") || s.includes("deepseek") || s.includes("gemma")) return "chat";
  return "other";
}

export async function fetchTogetherCatalog(): Promise<TogetherModel[]> {
  if (!CFG.TOGETHER_API_KEY) return [];
  const res = await fetch(`${CFG.TOGETHER_BASE_URL}/v1/models`, {
    headers: { Authorization: `Bearer ${CFG.TOGETHER_API_KEY}` },
  });
  if (!res.ok) throw new Error(`together /models ${res.status}`);
  const data = await res.json();
  const raw: any[] = Array.isArray(data?.data) ? data.data : [];

  const live: TogetherModel[] = raw.map((m) => {
    const id = m?.id ?? "";
    const pricing = m?.pricing ?? m?.price ?? {};
    return {
      id,
      context_length: m?.context_length ?? m?.max_context_length ?? undefined,
      modality: modalityFromId(id),
      family: familyFromId(id),
      pricing: {
        prompt: typeof pricing.prompt === "number" ? pricing.prompt / 1_000_000 : undefined,
        completion: typeof pricing.completion === "number" ? pricing.completion / 1_000_000 : undefined,
        cached_prompt: typeof pricing.cached_prompt === "number" ? pricing.cached_prompt / 1_000_000 : undefined,
      },
      multilingual: /\bmultilingual|qwen|m2m|intl\b/i.test(JSON.stringify(m)),
      reasoning: /\breason|r1|think|logic|math\b/i.test(JSON.stringify(m)),
    };
  });

  // overlay manual library: prefer manual if present
  const byId = new Map<string, TogetherModel>();
  for (const m of live) byId.set(m.id, m);
  for (const [id, patch] of Object.entries(MANUAL_LIBRARY)) {
    const base = byId.get(id) ?? { id };
    byId.set(id, {
      id,
      context_length: patch.context_length ?? base.context_length,
      modality: patch.modality ?? base.modality ?? modalityFromId(id),
      family: patch.family ?? base.family ?? familyFromId(id),
      pricing: patch.pricing ?? base.pricing,
      multilingual: patch.multilingual ?? base.multilingual,
      reasoning: patch.reasoning ?? base.reasoning,
      free: patch.free ?? base.free ?? false,
    });
  }

  // derive free from 0 pricing
  const merged: TogetherModel[] = [...byId.values()].map((m) => ({
    ...m,
    free: Boolean(m.free || (m.pricing && (m.pricing.prompt === 0 || m.pricing.completion === 0))),
  }));

  // keep only modalities we can use today
  return merged.filter((m) => ["chat", "embed", "moderation", "image", "audio"].includes(m.modality ?? "other"));
}

type CatalogState = { fetchedAt: number; models: TogetherModel[] };
let CACHE: CatalogState | null = null;

export async function getCatalog(force = false): Promise<TogetherModel[]> {
  const now = Date.now();
  if (!force && CACHE && now - CACHE.fetchedAt < CFG.CATALOG_TTL_MS) return CACHE.models;
  const models = await fetchTogetherCatalog();
  CACHE = { fetchedAt: now, models };
  return models;
}
