import { jwtVerify, createLocalJWKSet } from "jose";

let jwkSet: ReturnType<typeof createLocalJWKSet> | null = null;

/**
 * Verifies a Supabase JWT (Access Token) using the JWT secret.
 * Simpler path for MVP: symmetric verification with the project's JWT secret.
 */
export async function verifySupabaseJwt(token: string) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("Missing SUPABASE_JWT_SECRET");
  const encoder = new TextEncoder();
  const { payload } = await jwtVerify(token, encoder.encode(secret), {
    algorithms: ["HS256"]
  });
  return payload as { sub?: string; email?: string; role?: string };
}
