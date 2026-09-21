import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getStaffPermissions, getUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import type { Permission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: "/admin", label: "Dashboard", perm: "reports.view" },
  { href: "/admin/donors", label: "Donors", perm: "donors.view" },
  { href: "/admin/reports", label: "Reports", perm: "reports.view" },
  { href: "/admin/expenses", label: "Expenses", perm: "expenses.record" },
  { href: "/admin/reconciliation", label: "Reconciliation", perm: "finance.view" },
  { href: "/admin/offline-gift", label: "Offline gift", perm: "finance.view" },
  { href: "/admin/projects", label: "Projects", perm: "projects.manage" },
  { href: "/admin/sponsorships", label: "Sponsorships", perm: "projects.manage" },
  { href: "/admin/tiers", label: "Donation tiers", perm: "tiers.manage" },
  { href: "/admin/campaigns", label: "Campaigns", perm: "comms.send" },
  { href: "/admin/messages", label: "Messages", perm: "comms.send" },
  { href: "/admin/privacy", label: "Privacy requests", perm: "donors.edit" },
  { href: "/admin/staff", label: "Staff", perm: "staff.manage" },
  { href: "/admin/settings", label: "Settings", perm: "settings.manage" },
  { href: "/admin/audit", label: "Audit log", perm: "audit.view" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin");
  // Navigation is a convenience only. Every page and action re-checks its permission server-side and RLS enforces it again.
  const perms = await getStaffPermissions(user.id);
  return (
    <>
      <header className="bg-teal-800 text-white no-print">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-display text-lg font-semibold">Mission Giving · Admin</span>
          <form action={signOutAction}><button className="min-h-11 px-3 underline">Sign out</button></form>
        </div>
        {perms.size > 0 && (
          <nav aria-label="Admin" className="mx-auto max-w-6xl overflow-x-auto px-4">
            <ul className="flex gap-6 whitespace-nowrap">
              {NAV.filter((n) => perms.has(n.perm)).map((n) => (
                <li key={n.href}><Link href={n.href} className="inline-block min-h-11 py-2.5 hover:underline">{n.label}</Link></li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
