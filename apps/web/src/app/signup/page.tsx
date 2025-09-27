"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  async function signUp() {
    setStatus("Creating account…");

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setStatus(error.message);
      return;
    }

    // Supabase may require email confirmation depending on your settings
    if (!data.session) {
      setStatus("Account created. Please check your email to confirm.");
    } else {
      setStatus("Account created and signed in.");
      router.replace("/");
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white/10 p-6 backdrop-blur-xl">
        <h1 className="text-xl font-semibold mb-1 text-white">Create account</h1>
        <p className="text-sm text-slate-300 mb-4">
          Enter your email and a strong password.
        </p>

        <label className="block text-sm mb-1 text-slate-200">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 mb-3 text-slate-100"
          placeholder="you@example.com"
        />

        <label className="block text-sm mb-1 text-slate-200">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 mb-4 text-slate-100"
          placeholder="••••••••"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={signUp}
            className="rounded-xl bg-sky-300 text-slate-900 px-4 py-2 hover:bg-sky-200 transition"
          >
            Sign up
          </button>
          <a
            href="/login"
            className="text-sm text-sky-300 hover:underline"
          >
            Back to sign in
          </a>
        </div>

        {status && (
          <div className="mt-3 text-sm text-slate-300">{status}</div>
        )}
      </div>
    </main>
  );
}
