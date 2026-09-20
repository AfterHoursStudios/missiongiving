import Link from "next/link";
import type { Metadata } from "next";
import { getStaffPermissions, requireUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { Logo } from "@/components/site/logo";

export const metadata: Metadata = { title: { default: "Your account", template: "%s | Your account" }, robots: { index: false, follow: false } };

const links = [
  ["/dashboard", "Overview"], ["/dashboard/contributions", "Contributions"], ["/dashboard/recurring", "Recurring gifts"],
  ["/dashboard/statements", "Statements"], ["/dashboard/profile", "Profile"],
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isStaff = (await getStaffPermissions(user.id)).size > 0;
  return (
    <>
      <header className="border-b border-line no-print">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            {isStaff && <Link href="/admin" className="min-h-11 px-3 py-2 font-semibold underline">Admin</Link>}
            <Link href="/donate" className="min-h-11 rounded-md bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800">Give</Link>
            <form action={signOutAction}><button className="min-h-11 px-3 font-semibold underline">Sign out</button></form>
          </div>
        </div>
        <nav aria-label="Account" className="mx-auto max-w-5xl overflow-x-auto px-4">
          <ul className="flex gap-6 whitespace-nowrap">
            {links.map(([href, label]) => (
              <li key={href}><Link href={href} className="inline-block min-h-11 py-2.5 font-medium hover:underline">{label}</Link></li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
