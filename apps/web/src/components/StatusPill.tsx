"use client";

import { useEffect, useState } from "react";

export default function StatusPill() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const res = await fetch("http://localhost:8787/healthz", { cache: "no-store" });
        const data = await res.json();
        if (mounted) setOk(Boolean(data?.ok));
      } catch {
        if (mounted) setOk(false);
      }
    }
    check();
    const id = setInterval(check, 5000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const color = ok === null ? "bg-slate-400/60" : ok ? "bg-green-400" : "bg-red-400";
  const label = ok === null ? "checking…" : ok ? "online" : "offline";

  return (
    <div className="fixed top-3 right-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 bg-white/10 backdrop-blur-xl shadow-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-xs text-slate-200">API: {label}</span>
    </div>
  );
}
