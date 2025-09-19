"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendMagicLink() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "http://localhost:3000" }
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="h-screen w-screen flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
        <h1 className="text-lg font-semibold mb-2">Sign in</h1>
        <p className="text-sm text-slate-300/80 mb-4">
          Enter your email — we’ll send a magic link.
        </p>

        <input
          className="w-full rounded-xl px-3 py-2 bg-white/10 text-slate-100 border border-white/10 outline-none focus:ring-2 focus:ring-sky-300/40"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
        />

        <button
          onClick={() => void sendMagicLink()}
          className="mt-3 w-full rounded-xl bg-sky-300 text-slate-900 py-2 hover:bg-sky-200 transition disabled:opacity-60"
          disabled={!email || loading}
        >
          {loading ? "Sending…" : "Send magic link"}
        </button>

        {sent && <p className="text-xs text-green-300 mt-2">Check your email.</p>}
        {error && <p className="text-xs text-red-300 mt-2">{error}</p>}

        <div className="text-xs text-slate-400 mt-4">
          <Link href="/">← Back to app</Link>
        </div>
      </div>
    </main>
  );
}
