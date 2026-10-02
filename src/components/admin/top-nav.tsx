"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3, ChevronDown, CreditCard, FileText, Gift, Heart, Home, Mail, PlusCircle, Receipt, RefreshCw, Search, UserRound, Users, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaffTodoDialog } from "./staff-todo-dialog";
import type { TodoStaff } from "./todo-dialog";

/** A dropdown entry: a page link, or an action handled here (e.g. "todo" opens the staff to-do pop-up). */
export interface TopNavLink { href?: string; label: string; action?: "todo" }
export interface TopNavItem { key: string; label: string; icon: keyof typeof ICONS; href?: string; children?: TopNavLink[] }

const ICONS = {
  home: Home, users: Users, add: PlusCircle, gift: Gift, projects: FileText, mail: Mail, receipt: Receipt, reports: BarChart3, utilities: Wrench,
  heart: Heart, recurring: RefreshCw, card: CreditCard, statements: FileText, profile: UserRound,
} satisfies Record<string, LucideIcon>;

/**
 * Icon-over-label menu bar (CRM style) with an optional quick donor search on the left. Used by the admin and, without search
 * or dropdowns, by the donor account area (`rootHref`/`label` say which). Groups open a dropdown on click and close
 * on outside click, Escape or choosing a link. Hiding a link is only a convenience: every page still checks permissions on the server.
 */
export function AdminTopNav({ items, canSearch, todo, rootHref = "/admin", label = "Admin" }: {
  items: TopNavItem[]; canSearch: boolean; todo?: { staff: TodoStaff[]; me: string }; rootHref?: string; label?: string;
}) {
  const path = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const todoRef = useRef<HTMLDialogElement>(null);
  const [todoKey, setTodoKey] = useState(0);
  const openTodo = () => { setOpen(null); setTodoKey((k) => k + 1); todoRef.current?.showModal(); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  /** How well a link fits the current page: -1 = not this page; otherwise the number of its ?query values that match. */
  const fit = (href: string) => {
    const [linkPath, query = ""] = href.split("?");
    const onPath = linkPath === rootHref ? path === linkPath : path === linkPath || path.startsWith(`${linkPath}/`);
    if (!onPath) return -1;
    const wanted = [...new URLSearchParams(query)];
    return wanted.every(([k, v]) => search.get(k) === v) ? wanted.length : -1;
  };
  const matches = (href: string) => fit(href) >= 0;
  // In a dropdown, only the closest match is current: on "?frequency=one_time" that's One-time gift, not Phone/mail gift.
  const currentChild = (item: TopNavItem) => {
    const scored = (item.children ?? []).filter((c) => c.href).map((c) => ({ href: c.href!, score: fit(c.href!) })).filter((c) => c.score >= 0);
    return scored.sort((a, b) => b.score - a.score)[0]?.href ?? null;
  };
  const isActive = (item: TopNavItem) => (item.href ? matches(item.href) : currentChild(item) !== null);
  const tab = "flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[15px] text-ink hover:bg-paper-2";

  return (
    <div className="no-print border-b border-line bg-white">
      <div className="flex flex-wrap items-center gap-x-10 gap-y-2 px-4 py-2.5 md:px-6">
        {canSearch && (
          <form action="/admin/donors" method="get" role="search" aria-label="Quick donor search">
            <div className="flex">
              <label htmlFor="quick-search" className="sr-only">Quick search</label>
              <input id="quick-search" name="q" placeholder="Quick Search" className="min-h-10 w-64 rounded-l-md border border-ink-soft px-3" />
              <button aria-label="Search" className="min-h-10 rounded-r-md border border-l-0 border-ink-soft px-2.5 text-teal-600 hover:bg-paper-2"><Search size={18} aria-hidden="true" /></button>
            </div>
          </form>
        )}

        <nav ref={ref} aria-label={label} className="flex flex-1 justify-start">
          <ul className="flex flex-wrap items-center justify-start gap-x-2 lg:gap-x-4 xl:gap-x-6">
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(item);
              const face = (
                <>
                  <Icon aria-hidden="true" size={24} className={active ? "text-teal-800" : "text-ink-soft"} />
                  <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap", active && "font-semibold text-teal-800")}>
                    {item.label}{item.children && <ChevronDown aria-hidden="true" size={14} />}
                  </span>
                </>
              );
              return (
                <li key={item.key} className="relative">
                  {item.href ? (
                    <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(tab, active && "bg-paper-2")}>{face}</Link>
                  ) : (
                    <>
                      <button type="button" aria-expanded={open === item.key} aria-controls={`menu-${item.key}`}
                        onClick={() => setOpen(open === item.key ? null : item.key)} className={cn(tab, active && "bg-paper-2")}>{face}</button>
                      {open === item.key && (
                        <ul id={`menu-${item.key}`} className="absolute left-1/2 top-full z-30 mt-1 min-w-48 -translate-x-1/2 rounded-md border border-line bg-white py-1 shadow-md">
                          {item.children!.map((c) => (
                            <li key={c.href ?? c.action ?? c.label}>
                              {c.action === "todo" ? (
                                todo && <button type="button" onClick={openTodo} className="block min-h-11 w-full whitespace-nowrap px-4 py-2.5 text-left hover:bg-paper-2">{c.label}</button>
                              ) : (
                                <Link href={c.href!} onClick={() => setOpen(null)} aria-current={currentChild(item) === c.href ? "page" : undefined}
                                  className={cn("block min-h-11 whitespace-nowrap px-4 py-2.5 hover:bg-paper-2", currentChild(item) === c.href && "font-semibold text-teal-800")}>
                                  {c.label}
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      {todo && <StaffTodoDialog dialogRef={todoRef} formKey={todoKey} staff={todo.staff} me={todo.me} />}
    </div>
  );
}
