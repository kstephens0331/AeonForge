// apps/web/src/lib/api.ts

function toHeaderObject(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const obj: Record<string, string> = {};
    headers.forEach((v, k) => { obj[k] = v; });
    return obj;
  }
  if (Array.isArray(headers)) {
    const obj: Record<string, string> = {};
    for (const [k, v] of headers) obj[k] = v;
    return obj;
  }
  return { ...(headers as Record<string, string>) };
}

export async function apiFetch<T>(
  path: string,
  token?: string | null,
  init: RequestInit = {}
): Promise<T> {
  const url = `/api${path.startsWith('/') ? path : `/${path}`}`;

  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  const initHeaders = toHeaderObject(init.headers);
  if (token) initHeaders['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    ...init,
    headers: { ...baseHeaders, ...initHeaders },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  // Allow non-JSON responses when needed (typed by caller)
  return (await res.text()) as unknown as T;
}
