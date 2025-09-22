/// <reference types="node" />
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.AEONFORGE_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8787";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const body = await req.json().catch(() => ({}));

    const upstream = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    // If server failed, pass through message so UI can show it
    if (!upstream.ok || !upstream.body) {
      const msg = await upstream.text().catch(() => "");
      console.error("[proxy:/api/chat/stream] upstream error", upstream.status, msg);
      return new Response(msg || "upstream_error", {
        status: upstream.status || 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (e: any) {
    console.error("[proxy:/api/chat/stream] error:", e?.message || e);
    return new Response("proxy_error", { status: 502 });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
