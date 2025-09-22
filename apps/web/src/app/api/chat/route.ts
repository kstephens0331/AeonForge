// apps/web/src/app/api/chat/route.ts
import { getServerUrl } from "@/lib/serverUrl";
import { jsonProxy } from "@/lib/jsonProxy";

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
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const auth = req.headers.get("authorization");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };

  return jsonProxy(`${server}/chat`, { method: "POST", headers, body: JSON.stringify(body) });
}
