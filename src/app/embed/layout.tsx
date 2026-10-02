import type { Metadata } from "next";
import { EmbedAutoHeight } from "@/components/donate/embed-auto-height";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Pages shown inside other websites via an embed code (Donation forms → Embed code): no site header or footer, and
 * these are the only pages other sites may frame (see next.config.ts). Reports its height so the frame can fit it.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="bg-paper px-4 py-6">
      {children}
      <EmbedAutoHeight />
    </main>
  );
}
