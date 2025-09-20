"use client";

import { useEffect, useState } from "react";

export default function StatusPill() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch("http://localhost:8787/healthz", { cache: "no-store" });
        if (!cancelled) setStatus(res.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }
    ping();
    const id = setInterval(ping, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const color =
    status === "online" ? "bg-emerald-400" :
    status === "offline" ? "bg-rose-400" : "bg-slate-400";

  const label =
    status === "online" ? "API online" :
    status === "offline" ? "API offline" : "Checking…";

  return (
    <div className="fixed left-3 bottom-3 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate-100 backdrop-blur-xl">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}
