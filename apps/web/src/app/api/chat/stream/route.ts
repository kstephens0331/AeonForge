export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.AEONFORGE_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8787";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const body = await req.json().catch(() => ({}));

  const upstream = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!upstream.body) {
    const fallback = await upstream.text().catch(() => "");
    return new Response(fallback || "no body", { status: 502 });
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
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
