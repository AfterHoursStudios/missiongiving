import Link from "next/link";
import type { Metadata } from "next";
import { getStaffPermissions, requireUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { Logo } from "@/components/site/logo";
import { SideNav } from "@/components/site/side-nav";

export const metadata: Metadata = { title: { default: "Your account", template: "%s | Your account" }, robots: { index: false, follow: false } };

const items = [
  { href: "/dashboard", label: "Overview" }, { href: "/dashboard/contributions", label: "Contributions" },
  { href: "/dashboard/recurring", label: "Recurring gifts" }, { href: "/dashboard/statements", label: "Statements" },
  { href: "/dashboard/profile", label: "Profile" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isStaff = (await getStaffPermissions(user.id)).size > 0;
  return (
    <>
      <header className="border-b border-line no-print">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            {isStaff && <Link href="/admin" className="min-h-11 px-3 py-2 font-semibold underline">Admin</Link>}
            <Link href="/donate" className="min-h-11 rounded-md bg-brand-700 px-4 py-2 font-semibold text-white hover:bg-brand-800">Give</Link>
            <form action={signOutAction}><button className="min-h-11 px-3 font-semibold underline">Sign out</button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
        <SideNav items={items} label="Account" rootHref="/dashboard" />
        <main id="main" className="min-w-0 md:col-start-2">{children}</main>
      </div>
    </>
  );
}
