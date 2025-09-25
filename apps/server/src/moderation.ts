// apps/server/src/moderation.ts
import { getModelId } from "./models/modelCatalog.js"; // Named export exists and accepts "guard_text"

export const SAFE_REPLY =
  "I can’t help with that. If you want, I can provide a safer alternative or general information.";

const BASE_URL = process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1";
const API_KEY = process.env.TOGETHER_API_KEY || "";

/**
 * Run a moderation check using the Together API.
 * Returns true if allowed, false if blocked.
 */
export async function checkSafety(text: string): Promise<boolean> {
  try {
    // TS guard: allow string alias here even if ModelAlias is strict in your types.ts
    const getModel = getModelId as unknown as (alias: string) => string;
    const model = getModel("guard_text");

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a safety classifier. Reply with 'ALLOW' or 'BLOCK' only.",
          },
          { role: "user", content: text },
        ],
        temperature: 0.0,
      }),
    });

    if (!res.ok) return true; // fail-open

    const json = await res.json();
    const decision = (json?.choices?.[0]?.message?.content ?? "")
      .trim()
      .toUpperCase();
    return decision.startsWith("ALLOW");
  } catch {
    return true; // fail-open
  }
}

// Back-compat: some callers import { moderateTextOrAllow }
// Provide a thin wrapper that preserves the boolean contract (true = allow)
export async function moderateTextOrAllow(text: string): Promise<boolean> {
  return checkSafety(text);
}
