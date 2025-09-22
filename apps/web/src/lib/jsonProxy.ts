// apps/web/src/lib/jsonProxy.ts
export async function jsonProxy(
  url: string,
  init: RequestInit
): Promise<Response> {
  const upstream = await fetch(url, { ...init, cache: "no-store" });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({
        error: "Upstream error",
        status: upstream.status,
        detail: detail.slice(0, 500),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Pass through body & content-type from upstream
  const ct = upstream.headers.get("content-type") || "application/json";
  return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": ct } });
}
