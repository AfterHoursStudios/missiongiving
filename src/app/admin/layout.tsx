import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LogOut, Settings } from "lucide-react";
import { getStaffPermissions, getUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";
import type { Permission } from "@/lib/auth/permissions";
import { AdminTopNav, type TopNavItem } from "@/components/admin/top-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

type Link_ = { href?: string; label: string; perm: Permission; action?: "todo" };
type Group = { key: string; label: string; icon: TopNavItem["icon"] } & ({ href: string; perm: Permission } | { children: Link_[] });

const NAV: Group[] = [
  { key: "home", label: "Home", icon: "home", href: "/admin", perm: "reports.view" },
  { key: "donors", label: "Donors", icon: "users", href: "/admin/donors", perm: "donors.view" },
  { key: "add", label: "Add New", icon: "add", children: [
    { href: "/admin/donors/new", label: "Donor", perm: "donors.edit" },
    { href: "/admin/projects/new", label: "Project", perm: "projects.manage" },
    { href: "/admin/campaigns/new", label: "Campaign", perm: "comms.send" },
    { action: "todo", label: "To-do", perm: "donors.edit" },
  ] },
  { key: "gifts", label: "Gifts", icon: "gift", children: [
    { href: "/admin/virtual-terminal?frequency=one_time", label: "One-time gift", perm: "finance.view" },
    { href: "/admin/virtual-terminal", label: "Phone/mail gift", perm: "finance.view" },
    { href: "/admin/offline-gift", label: "Offline gift", perm: "finance.view" },
  ] },
  { key: "projects", label: "Projects", icon: "projects", children: [
    { href: "/admin/projects", label: "Projects", perm: "projects.manage" },
    { href: "/admin/sponsorships", label: "Sponsorships", perm: "projects.manage" },
    { href: "/admin/campaigns", label: "Campaigns", perm: "comms.send" },
  ] },
  { key: "mailings", label: "Mailings/Forms", icon: "mail", children: [
    { href: "/admin/messages", label: "Messages", perm: "comms.send" },
    { href: "/admin/forms", label: "Donation forms", perm: "projects.manage" },
  ] },
  { key: "expenses", label: "Expenses", icon: "receipt", href: "/admin/expenses", perm: "expenses.record" },
  { key: "reports", label: "Reports", icon: "reports", href: "/admin/reports", perm: "reports.view" },
  { key: "utilities", label: "Utilities", icon: "utilities", children: [
    { href: "/admin/staff", label: "Staff", perm: "staff.manage" },
    { href: "/admin/tiers", label: "Donation tiers", perm: "tiers.manage" },
    { href: "/admin/reconciliation", label: "Reconciliation", perm: "finance.view" },
    { href: "/admin/privacy", label: "Privacy requests", perm: "donors.edit" },
    { href: "/admin/audit", label: "Audit log", perm: "audit.view" },
  ] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin");
  // Navigation is a convenience only. Every page and action re-checks its permission server-side and RLS enforces it again.
  const perms = await getStaffPermissions(user.id);
  const items: TopNavItem[] = NAV.flatMap((g): TopNavItem[] => {
    if ("href" in g) return perms.has(g.perm) ? [{ key: g.key, label: g.label, icon: g.icon, href: g.href }] : [];
    const kids = g.children.filter((c) => perms.has(c.perm)).map(({ href, label, action }) => ({ href, label, action }));
    return kids.length ? [{ key: g.key, label: g.label, icon: g.icon, children: kids }] : [];
  });
  // Staff to-do pop-up (Add New → To-do): the active staff it can be assigned to.
  const todoStaff = perms.has("donors.edit")
    ? ((await createSupabaseAdminClient().from("staff_profiles").select("user_id, display_name").eq("active", true).order("display_name")).data ?? [])
      .map((s) => ({ id: s.user_id as string, name: s.display_name as string }))
    : null;
  const topLink = "inline-flex min-h-11 items-center gap-1.5 px-2 hover:underline";
  return (
    <div className="app-shell flex flex-1 flex-col">
      <header className="no-print bg-teal-800 text-sm text-white">
        <div className="flex flex-wrap items-center justify-between gap-x-4 px-4 md:px-6">
          {/* The same logo as the public site, shown in solid white (as on the sign-in page) because its navy lettering would vanish on the dark bar. */}
          <Link href="/admin" aria-label="Mission Giving admin home" className="my-1.5 inline-flex min-h-11 items-center py-1">
            <Image src="/images/mg-logo.png" alt="Mission Giving" width={760} height={199} priority className="h-8 w-auto brightness-0 invert" />
          </Link>
          <div className="flex flex-wrap items-center gap-x-3">
            {perms.has("settings.manage") && <Link href="/admin/settings" className={topLink}><Settings aria-hidden="true" size={16} />Settings</Link>}
            <form action={signOutAction}>
              <button className={topLink}><LogOut aria-hidden="true" size={16} />Log out{user.email ? `: ${user.email.split("@")[0]}` : ""}</button>
            </form>
          </div>
        </div>
      </header>
      <AdminTopNav items={items} canSearch={perms.has("donors.view")} todo={todoStaff ? { staff: todoStaff, me: user.id } : undefined} />
      <main id="main" className="w-full min-w-0 flex-1 bg-canvas px-4 py-5 md:px-6">{children}</main>
    </div>
  );
}
