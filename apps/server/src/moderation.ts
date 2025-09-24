import { getModelId } from "./models/modelCatalog.js";

export const SAFE_REPLY =
  "I can’t help with that. If you want, I can provide a safer alternative or general information.";

const BASE_URL = process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1";
const API_KEY  = process.env.TOGETHER_API_KEY || "";

export async function moderateTextOrAllow(text: string): Promise<boolean> {
  try {
    const model = getModelId("guard_text");
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a safety classifier. Reply with 'ALLOW' or 'BLOCK' only." },
          { role: "user", content: text }
        ],
        temperature: 0.0,
      }),
    });
    if (!res.ok) return true; // fail-open (never blocks by network issues)
    const json = await res.json();
    const decision = (json?.choices?.[0]?.message?.content ?? "").trim().toUpperCase();
    return decision.startsWith("ALLOW");
  } catch {
    return true; // fail-open
  }
}
