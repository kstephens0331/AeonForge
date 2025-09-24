export async function apiFetch<T = any>(path: string, token?: string | null, init?: RequestInit): Promise<T> {
const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}` , {
...init,
headers: {
'Content-Type': 'application/json',
...(init?.headers || {}),
...(token ? { Authorization: `Bearer ${token}` } : {}),
},
cache: 'no-store',
});
if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
return res.json();
}