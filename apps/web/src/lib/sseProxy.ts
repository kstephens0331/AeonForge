// apps/web/src/lib/sseProxy.ts
export async function sseProxy(
  url: string,
  init: RequestInit
): Promise<Response> {
  const upstream = await fetch(url, { ...init, cache: "no-store" });

  if (!upstream.ok || !upstream.body) {
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

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

  // Pipe upstream bytes → client unchanged
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
  })().catch(() => { /* client cancelled / upstream closed */ });

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
