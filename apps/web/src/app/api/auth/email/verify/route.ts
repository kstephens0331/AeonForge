// apps/web/src/app/api/auth/email/verify/route.ts
import { getServerUrl } from "@/lib/serverUrl";
import { jsonProxy } from "@/lib/jsonProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const server = getServerUrl();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  return jsonProxy(`${server}/auth/email/verify`, {
    method: "POST",
    headers,
    body: await req.text(),
  });
}
