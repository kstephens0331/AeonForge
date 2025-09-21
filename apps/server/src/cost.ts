import { getCatalog } from "./providers/togetherCatalog.js";

export type Price = { inTok?: number; outTok?: number }; // $/token

function findPrice(pricing?: { prompt?: number; completion?: number }): Price {
  return {
    inTok: typeof pricing?.prompt === "number" ? pricing.prompt : undefined,
    outTok: typeof pricing?.completion === "number" ? pricing.completion : undefined,
  };
}

/** Lookup $/token for a Together model id. Falls back to undefined if unknown. */
export async function getTogetherPricePerToken(modelId: string): Promise<Price> {
  const cat = await getCatalog(false);
  const m = cat.find((x) => x.id === modelId);
  return findPrice(m?.pricing);
}

/** Compute $ cost for a given provider/model + token usage. Unknown pricing → 0. */
export function costFromTokens(tokensIn: number, tokensOut: number, p: Price): number {
  const pin = p.inTok ?? 0;
  const pout = p.outTok ?? 0;
  const ain = Math.max(0, tokensIn | 0);
  const aout = Math.max(0, tokensOut | 0);
  const cost = ain * pin + aout * pout;
  // round to 6 decimals to avoid long floats in DB
  return Math.round(cost * 1e6) / 1e6;
}

/** Rough token estimator: ~4 chars ≈ 1 token (fast & good enough for guardrails) */
export function estimateTokensFromText(s: string): number {
  return Math.ceil((s ?? "").length / 4);
}
