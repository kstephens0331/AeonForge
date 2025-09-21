import { CFG } from "./config";

const MOD_MODEL = process.env.MODERATION_MODEL_ID ?? "meta-llama/Llama-Guard-4-12B"; // adjust anytime

type Verdict = "allow" | "block";
export async function moderateTextOrAllow(text: string): Promise<Verdict> {
  try {
    if (!CFG.TOGETHER_API_KEY) return "allow"; // skip if no cloud
    const res = await fetch(`${CFG.TOGETHER_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CFG.TOGETHER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MOD_MODEL,
        messages: [
          { role: "system", content: "Classify the following user message as ALLOW or BLOCK for safety/compliance. Reply with exactly one word: ALLOW or BLOCK." },
          { role: "user", content: text.slice(0, 8000) },
        ],
        temperature: 0,
      }),
    });
    if (!res.ok) return "allow";
    const data = await res.json();
    const out = String(data?.choices?.[0]?.message?.content ?? "").trim().toUpperCase();
    return out.startsWith("BLOCK") ? "block" : "allow";
  } catch {
    return "allow";
  }
}

export const SAFE_REPLY =
  "I can’t help with that request, but I’m happy to help with a safer alternative or general information.";
