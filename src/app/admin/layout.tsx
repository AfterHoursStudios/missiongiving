import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>;
}
