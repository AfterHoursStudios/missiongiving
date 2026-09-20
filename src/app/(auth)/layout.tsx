import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-12">
      <Link href="/" className="font-display text-2xl font-semibold text-brand-800">Mission Giving</Link>
      <div className="mt-8">{children}</div>
    </main>
  );
}
