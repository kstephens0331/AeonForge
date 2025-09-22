export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.AEONFORGE_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8787";

export async function GET() {
  const res = await fetch(`${API_BASE}/healthz`, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  return new Response(text || (res.ok ? '{"ok":true}' : "unhealthy"), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}
