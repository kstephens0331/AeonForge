export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.AEONFORGE_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8787";

async function handle(method: string, req: Request) {
  const url = new URL(req.url);
  const restPath = url.pathname.replace(/^\/api\//, "");
  const auth = req.headers.get("authorization") ?? "";
  const contentType = req.headers.get("content-type") ?? undefined;

  const init: RequestInit = {
    method,
    headers: {
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(auth ? { Authorization: auth } : {}),
    },
    cache: "no-store",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(`${API_BASE}/${restPath}`, init);

  return new Response(upstream.body ?? null, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

export async function GET(req: Request)    { return handle("GET", req); }
export async function POST(req: Request)   { return handle("POST", req); }
export async function PUT(req: Request)    { return handle("PUT", req); }
export async function PATCH(req: Request)  { return handle("PATCH", req); }
export async function DELETE(req: Request) { return handle("DELETE", req); }
export function OPTIONS() { return new Response(null, { status: 204 }); }
