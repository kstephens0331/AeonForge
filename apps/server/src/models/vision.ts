// apps/server/src/models/vision.ts
// Multimodal support for image analysis

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY ?? "";
const TOGETHER_BASE_URL = (process.env.TOGETHER_BASE_URL ?? "https://api.together.xyz").replace(/\/+$/, "");

export type VisionMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }>;
};

/**
 * Analyze an image with a vision model
 * @param imageUrl - URL or base64 data URI of the image
 * @param prompt - What to ask about the image
 * @param modelId - Vision model to use (default: llava-v1.5-13b)
 */
export async function analyzeImage(
  imageUrl: string,
  prompt: string = "Describe this image in detail.",
  modelId?: string
): Promise<{ success: boolean; text: string; error?: string }> {
  const model = modelId || process.env.TOGETHER_MODEL_VISION || "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo";

  try {
    const messages: VisionMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ];

    const res = await fetch(`${TOGETHER_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOGETHER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        text: "",
        error: `Vision API error ${res.status}: ${errorText}`
      };
    }

    const json: any = await res.json();
    const text = json.choices?.[0]?.message?.content ?? "";

    return {
      success: true,
      text,
    };
  } catch (e: any) {
    return {
      success: false,
      text: "",
      error: e?.message ?? "Vision analysis failed"
    };
  }
}

/**
 * Convert file buffer to base64 data URI
 */
export function bufferToDataUri(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}