// apps/web/src/lib/api.ts
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE ?? "")
  .replace(/\/+$/, ""); // strip trailing slash

function join(base: string, path: string) {
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path; // if you later proxy /api/*, passing "/api/..." works too
}

export async function apiFetch<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const url = join(API_BASE, path);
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  // add JSON header only if there is a body and no header provided
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}
