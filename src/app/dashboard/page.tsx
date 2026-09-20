import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold">Welcome</h1>
      <p className="mt-2 text-ink-soft">Signed in as {user.email}. Giving history arrives in Phase 3.</p>
      <form action={signOutAction} className="mt-6">
        <button className="min-h-11 rounded-md border-2 border-teal-800 px-5 font-semibold text-teal-800">Sign out</button>
      </form>
    </main>
  );
}
