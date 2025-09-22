// apps/web/src/app/api/chat/stream/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatBody = {
  conversationId?: string | null;
  text: string;
  targetWords?: number | null;
};

function getServerUrl(): string {
  const env1 = process.env.NEXT_PUBLIC_SERVER_URL;
  const env2 = process.env.SERVER_URL;
  // Fallback to your Railway URL; adjust if yours differs
  const fallback = "https://aeonforgeserver-production.up.railway.app";
  return (env1 || env2 || fallback).replace(/\/+$/, "");
}

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

  const upstream = await fetch(`${server}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    } as HeadersInit,
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({
        error: `Upstream error`,
        status: upstream.status,
        detail: detail.slice(0, 500),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Stream the upstream SSE bytes to the client unchanged.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  (async () => {
    const reader = upstream.body!.getReader();
    const writer = writable.getWriter();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) await writer.write(value);
      }
    } finally {
      await writer.close();
      reader.releaseLock();
    }
  })().catch(() => { /* no-op */ });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
