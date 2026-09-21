"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SideNavItem { href: string; label: string }

/**
 * Left-hand navigation. On wide screens it is a vertical sidebar that stays in view; on phones it becomes a horizontally
 * scrolling strip above the content. The current page is marked with aria-current and a visible highlight.
 * Hiding a link here is only a convenience: every page still checks permissions on the server.
 */
export function SideNav({ items, label, rootHref }: { items: SideNavItem[]; label: string; rootHref: string }) {
  const path = usePathname();
  const isActive = (href: string) => (href === rootHref ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label={label} className="no-print mb-6 overflow-x-auto border-b border-line md:sticky md:top-4 md:mb-0 md:self-start md:overflow-visible md:border-b-0">
      <ul className="flex gap-1 whitespace-nowrap md:flex-col md:gap-0.5">
        {items.map((n) => (
          <li key={n.href}>
            <Link href={n.href} aria-current={isActive(n.href) ? "page" : undefined}
              className={cn("block min-h-11 rounded-md px-3 py-2.5 font-medium hover:bg-paper-2",
                isActive(n.href) ? "bg-brand-50 font-semibold text-brand-800 md:border-l-4 md:border-brand-700" : "text-ink")}>
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
