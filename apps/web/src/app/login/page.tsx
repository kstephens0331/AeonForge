"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { saveToken } from "@/lib/auth.js";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"start" | "verify">("start");
  const [status, setStatus] = useState<string>("");

  // Optional: support token in URL (?token=...)
  useEffect(() => {
    const token = search.get("token");
    if (token) {
      saveToken(token);
      router.replace("/");
    }
  }, [search, router]);

  async function startEmailLogin() {
    setStatus("Sending code…");
    try {
      await apiFetch("/auth/email/start", null, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setPhase("verify");
      setStatus("Check your email for the 6-digit code.");
    } catch (e: any) {
      setStatus(`Failed to send code: ${e.message || e}`);
    }
  }

  async function verifyCode() {
    setStatus("Verifying…");
    try {
      const { token } = await apiFetch<{ token: string }>("/auth/email/verify", null, {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      if (!token) throw new Error("No token returned");
      saveToken(token);
      router.replace("/");
    } catch (e: any) {
      setStatus(`Invalid code: ${e.message || e}`);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-gray-600 mb-4">Use your email to receive a one-time code.</p>

        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 mb-3"
          placeholder="you@example.com"
        />

        {phase === "verify" && (
          <>
            <label className="block text-sm mb-1">6-digit code</label>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full rounded-xl border px-3 py-2 mb-3 tracking-widest text-center"
              placeholder="000000"
            />
          </>
        )}

        <div className="flex gap-2">
          {phase === "start" ? (
            <button onClick={startEmailLogin} className="rounded-xl border px-4 py-2">Send code</button>
          ) : (
            <>
              <button onClick={verifyCode} className="rounded-xl border px-4 py-2">Verify</button>
              <button onClick={() => setPhase("start")} className="rounded-xl border px-4 py-2">Back</button>
            </>
          )}
        </div>

        {status && <div className="mt-3 text-sm text-gray-600">{status}</div>}
      </div>
    </main>
  );
}
