// apps/web/src/lib/api.ts
const BASE = "/api"; // next.config.ts proxies this to Railway

function join(path: string) {
  return path.startsWith("/") ? `${BASE}${path}` : `${BASE}/${path}`;
}

export async function apiFetch<T>(
  path: string,
  accessToken?: string,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(join(path), { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
