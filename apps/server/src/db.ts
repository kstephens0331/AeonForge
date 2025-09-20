import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Candidate env file locations
const candidateEnvPaths = [
  path.resolve(process.cwd(), ".env"),             // repo root .env
  path.resolve(process.cwd(), "apps/server/.env"), // monorepo root -> server .env
  path.resolve(__dirname, "../.env"),              // alongside compiled dist
  path.resolve(__dirname, "../../.env"),           // fallback
];

let loadedFrom: string | null = null;
for (const p of candidateEnvPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    loadedFrom = p;
    break;
  }
}

if (!loadedFrom) {
  console.warn(
    "[env] No .env file found. Looked in:\n" +
      candidateEnvPaths.map((p) => " - " + p).join("\n")
  );
} else {
  console.log("[env] Loaded environment from:", loadedFrom);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[env] SUPABASE_URL:", SUPABASE_URL ? "(set)" : "(missing)");
  console.error(
    "[env] SUPABASE_SERVICE_ROLE_KEY:",
    SUPABASE_SERVICE_ROLE_KEY ? "(set)" : "(missing)"
  );
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});