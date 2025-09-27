"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";  // ⬅️ use your export
import { clearToken } from "../../lib/auth";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await supabase.auth.signOut();
      clearToken();
      router.replace("/login");
    })();
  }, [router]);

  return <div className="min-h-screen grid place-items-center p-6">Signing out…</div>;
}
