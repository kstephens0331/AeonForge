"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";  // ⬅️ use your export

export default function SignupClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  async function signUp() {
    setStatus("Creating account…");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) { setStatus(error.message); return; }
    setStatus("Account created. Please sign in.");
    router.replace("/login");
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">Create account</h1>
        <p className="text-sm text-gray-600 mb-4">Enter your email and a strong password.</p>

        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 mb-3"
          placeholder="you@example.com"
        />

        <label className="block text-sm mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 mb-4"
          placeholder="••••••••"
        />

        <div className="flex items-center gap-3">
          <button onClick={signUp} className="rounded-xl border px-4 py-2">Sign up</button>
          <a href="/login" className="text-sm text-blue-600 hover:underline">Back to sign in</a>
        </div>

        {status && <div className="mt-3 text-sm text-gray-600">{status}</div>}
      </div>
    </main>
  );
}
