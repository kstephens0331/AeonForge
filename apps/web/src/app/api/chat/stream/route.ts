// apps/web/src/app/api/chat/stream/route.ts
import { getServerUrl } from "@/lib/serverUrl";
import { sseProxy } from "@/lib/sseProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatBody = {
  conversationId?: string | null;
  text: string;
  targetWords?: number | null;
};

export async function POST(req: Request): Promise<Response> {
  const server = getServerUrl();

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("authorization");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };

  return sseProxy(`${server}/chat/stream`, { method: "POST", headers, body: JSON.stringify(body) });
}
