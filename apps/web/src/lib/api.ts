export async function apiFetch<T>(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`http://localhost:8787${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });
  if (!res.ok) {
    let msg = "Request failed";
    try { const j = await res.json(); msg = j?.error || msg; } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
