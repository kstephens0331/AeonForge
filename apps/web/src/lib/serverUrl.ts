// apps/web/src/lib/serverUrl.ts
export function getServerUrl(): string {
  const env1 = process.env.NEXT_PUBLIC_SERVER_URL;
  const env2 = process.env.SERVER_URL;
  // Change if your Railway URL differs:
  const fallback = "https://aeonforgeserver-production.up.railway.app";
  return (env1 || env2 || fallback).replace(/\/+$/, "");
}
