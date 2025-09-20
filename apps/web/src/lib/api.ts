export async function apiFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit & { signal?: AbortSignal }
): Promise<T> {
  const res = await fetch(`http://localhost:8787${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    ...init,
  });

  // If aborted, surface a friendly error
  if (res.body === null && (init?.signal?.aborted ?? false)) {
    throw new Error("Request aborted");
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
