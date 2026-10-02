import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { Heart, LayoutDashboard, LogOut } from "lucide-react";
import { getStaffPermissions, requireUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { AdminTopNav, type TopNavItem } from "@/components/admin/top-nav";

export const metadata: Metadata = { title: { default: "Your account", template: "%s | Your account" }, robots: { index: false, follow: false } };

const items: TopNavItem[] = [
  { key: "overview", label: "Overview", icon: "home", href: "/dashboard" },
  { key: "sponsored", label: "Sponsored worker", icon: "heart", href: "/dashboard/sponsored" },
  { key: "contributions", label: "Contributions", icon: "gift", href: "/dashboard/contributions" },
  { key: "recurring", label: "Recurring gifts", icon: "recurring", href: "/dashboard/recurring" },
  { key: "payment", label: "Payment methods", icon: "card", href: "/dashboard/payment-methods" },
  { key: "statements", label: "Statements", icon: "statements", href: "/dashboard/statements" },
  { key: "profile", label: "Profile", icon: "profile", href: "/dashboard/profile" },
];

/* Same shell as the admin (teal bar, icon menu, gray workspace with white panels), with only the donor's own pages. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isStaff = (await getStaffPermissions(user.id)).size > 0;
  const topLink = "inline-flex min-h-11 items-center gap-1.5 px-2 hover:underline";
  return (
    <div className="app-shell flex flex-1 flex-col">
      <header className="no-print bg-teal-800 text-sm text-white">
        <div className="flex flex-wrap items-center justify-between gap-x-4 px-4 md:px-6">
          {/* Shown in solid white because the logo's navy lettering would vanish on the dark bar. */}
          <Link href="/dashboard" aria-label="Your Mission Giving account" className="my-1.5 inline-flex min-h-11 items-center py-1">
            <Image src="/images/mg-logo.png" alt="Mission Giving" width={760} height={199} priority className="h-8 w-auto brightness-0 invert" />
          </Link>
          <div className="flex flex-wrap items-center gap-x-3">
            {isStaff && <Link href="/admin" className={topLink}><LayoutDashboard aria-hidden="true" size={16} />Admin</Link>}
            <Link href="/dashboard/give" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-gold px-4 font-semibold text-ink hover:bg-gold/90">
              <Heart aria-hidden="true" size={15} />Give
            </Link>
            <form action={signOutAction}>
              <button className={topLink}><LogOut aria-hidden="true" size={16} />Log out</button>
            </form>
          </div>
        </div>
      </header>
      <AdminTopNav items={items} canSearch={false} rootHref="/dashboard" label="Account" />
      <main id="main" className="w-full min-w-0 flex-1 bg-canvas px-4 py-5 md:px-6">
        {children}
      </main>
    </div>
  );
}
