// apps/web/src/lib/auth.ts

export function saveToken(token: string) {
  try {
    localStorage.setItem("af_token", token);
    // Let other tabs/pages know
    window.dispatchEvent(new StorageEvent("storage", { key: "af_token", newValue: token }));
  } catch {}
}

export function getToken(): string | null {
  try {
    return localStorage.getItem("af_token");
  } catch {
    return null;
  }
}

export function clearToken() {
  try {
    localStorage.removeItem("af_token");
    window.dispatchEvent(new StorageEvent("storage", { key: "af_token", newValue: null }));
  } catch {}
}
