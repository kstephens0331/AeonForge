// apps/web/src/app/signup/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  async function signUp() {
    setStatus("");
    // basic client-side checks
    if (username.trim().length < 3) {
      setStatus("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }

    setStatus("Creating account…");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim() }, // store in user_metadata
      },
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    // If email confirmation is enabled, there won't be a session yet.
    if (!data.session) {
      setStatus("Account created. Check your email to confirm, then sign in.");
      // slight delay so user can read the message
      setTimeout(() => router.replace("/login"), 800);
    } else {
      setStatus("Account created and signed in.");
      router.replace("/");
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl shadow-[0_20px_120px_rgba(0,0,0,.35)]">
        <h1 className="text-xl font-semibold mb-1 text-white">Create account</h1>
        <p className="text-sm text-slate-300 mb-4">
          Enter a username, your email, and a strong password.
        </p>

        <label className="block text-sm mb-1 text-slate-200">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 mb-3 text-slate-100 outline-none focus:ring-2 focus:ring-sky-300/40"
          placeholder="yourname"
        />

        <label className="block text-sm mb-1 text-slate-200">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 mb-3 text-slate-100 outline-none focus:ring-2 focus:ring-sky-300/40"
          placeholder="you@example.com"
          autoComplete="email"
        />

        <label className="block text-sm mb-1 text-slate-2 00">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 mb-4 text-slate-100 outline-none focus:ring-2 focus:ring-sky-300/40"
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={signUp}
            className="rounded-xl bg-sky-300 text-slate-900 px-4 py-2 hover:bg-sky-200 transition"
          >
            Sign up
          </button>
          <a href="/login" className="text-sm text-sky-300 hover:underline">
            Back to sign in
          </a>
        </div>

        {status && <div className="mt-3 text-sm text-slate-300">{status}</div>}

        <p className="mt-4 text-[11px] text-slate-400">
          Tip: Ensure Email/Password is enabled in Supabase Auth and (optionally) Email Confirmations if you want verification before first sign-in.
        </p>
      </div>
    </main>
  );
}
