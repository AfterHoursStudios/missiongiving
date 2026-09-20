import { Logo } from "@/components/site/logo";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-12">
      <Logo className="h-12" priority />
      <div className="mt-8">{children}</div>
    </main>
  );
}
