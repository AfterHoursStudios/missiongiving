import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyUnsubscribe, readToken } from "@/lib/comms/unsubscribe";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function confirm(form: FormData) {
  "use server";
  const token = String(form.get("t") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`unsub:${ip}`, 30, 60_000).ok) redirect(`/unsubscribe?t=${encodeURIComponent(token)}&done=busy`);
  const who = readToken(token);
  if (!who) redirect("/unsubscribe?done=invalid");
  const r = await applyUnsubscribe(who.donorId, who.campaignId);
  revalidatePath("/unsubscribe");
  redirect(`/unsubscribe?done=${r.ok ? "yes" : "error"}`);
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const { t, done } = await searchParams;
  const valid = !!readToken(t);
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-3xl font-semibold">Unsubscribe</h1>
      {done === "yes" ? (
        <p role="status" className="mt-6 rounded-md bg-success-bg p-4 text-success">You have been unsubscribed from Mission Giving news and project emails. You will still receive receipts and payment notices for gifts you make. You can change this any time from your account.</p>
      ) : done === "invalid" || (!t && !done) || (t && !valid) ? (
        <p role="alert" className="mt-6 rounded-md bg-danger-bg p-4 text-danger">This unsubscribe link is not valid. Please use the link in the most recent email, or sign in and change your email preferences under Profile.</p>
      ) : done === "error" || done === "busy" ? (
        <p role="alert" className="mt-6 rounded-md bg-danger-bg p-4 text-danger">Something went wrong. Please try again in a moment.</p>
      ) : null}
      {valid && done !== "yes" && (
        <form action={confirm} className="mt-6 space-y-4">
          <p>Stop receiving news and project emails from Mission Giving? Receipts and payment notices for your gifts will continue.</p>
          <input type="hidden" name="t" value={t} />
          <button className="min-h-12 w-full rounded-md bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">Yes, unsubscribe me</button>
        </form>
      )}
    </main>
  );
}
