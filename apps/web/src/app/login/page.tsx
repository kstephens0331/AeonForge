import { Suspense } from "react";
import LoginClient from "./LoginClient";


// Ensure this page can read client-side search params without static prerender errors
export const dynamic = "force-dynamic";


export default function Page() {
return (
<Suspense fallback={<div className="min-h-screen grid place-items-center p-6">Loading…</div>}>
<LoginClient />
</Suspense>
);
}