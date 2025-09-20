"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); // used on signup
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    setInfo(null);
  }, [mode]);

  async function onSignIn() {
    setErr(null);
    setInfo(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
    } else {
      setInfo("Signed in.");
      // Next.js will re-render home page state using the new session
      window.location.href = "/";
    }
  }

  async function onSignUp() {
    setErr(null);
    setInfo(null);

    // Basic client-side validation
    if (username.trim().length < 3) {
      setErr("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    // If email confirmation is enabled, Supabase won't return a session here.
    if (!data.session) {
      setInfo("Signup successful. Check your email to confirm before signing in.");
    } else {
      setInfo("Account created and signed in.");
      window.location.href = "/";
    }
  }

  return (
    <main className="h-screen w-screen flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">AeonForge</h1>
          <Link href="/" className="text-xs text-slate-300/80 hover:text-white">← Back</Link>
        </div>

        {/* Mode switch */}
        <div className="inline-flex rounded-xl border border-white/10 bg-white/10 p-1 mb-4">
          <button
            onClick={() => setMode("signin")}
            className={`px-3 py-1.5 rounded-lg text-sm ${mode === "signin" ? "bg-sky-300 text-slate-900" : "text-slate-200 hover:text-white"}`}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`px-3 py-1.5 rounded-lg text-sm ${mode === "signup" ? "bg-sky-300 text-slate-900" : "text-slate-200 hover:text-white"}`}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <div className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="text-xs text-slate-300/80">Username</label>
              <input
                className="mt-1 w-full rounded-xl px-3 py-2 bg-white/10 text-slate-100 border border-white/10 outline-none focus:ring-2 focus:ring-sky-300/40"
                placeholder="yourname"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="text-xs text-slate-300/80">Email</label>
            <input
              className="mt-1 w-full rounded-xl px-3 py-2 bg-white/10 text-slate-100 border border-white/10 outline-none focus:ring-2 focus:ring-sky-300/40"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-xs text-slate-300/80">Password</label>
            <input
              className="mt-1 w-full rounded-xl px-3 py-2 bg-white/10 text-slate-100 border border-white/10 outline-none focus:ring-2 focus:ring-sky-300/40"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>

          <button
            onClick={() => (mode === "signin" ? void onSignIn() : void onSignUp())}
            className="w-full rounded-xl bg-sky-300 text-slate-900 py-2.5 hover:bg-sky-200 transition disabled:opacity-60"
            disabled={loading || !email || !password || (mode === "signup" && !username)}
          >
            {loading ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          {err && <p className="text-xs text-red-300">{err}</p>}
          {info && <p className="text-xs text-green-300">{info}</p>}
        </div>

        <p className="mt-4 text-[11px] text-slate-400">
          Trouble signing in? Make sure Email/Password is enabled in Supabase Auth Providers.
        </p>
      </div>
    </main>
  );
}
