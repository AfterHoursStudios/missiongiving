import Link from "next/link";
import { ChevronUp, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared styling for inputs on the donor record (CRM-style: compact, label to the left). */
export const inputCls = "min-h-10 w-full rounded border border-ink-soft/60 bg-white px-2.5 disabled:bg-paper-2 disabled:text-ink-soft";
export const linkCls = "font-semibold text-teal-600 hover:underline";

/** A white panel holding one collapsible section, titled like a CRM record section ("Constituent contact information"). */
export function Section({ title, extra, children, defaultOpen = true }: { title: string; extra?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group mt-4 rounded-lg border border-line bg-white shadow-sm">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5 text-lg font-bold text-teal-800 underline underline-offset-2">
          <ChevronUp aria-hidden="true" size={18} className="rotate-180 rounded-full bg-teal-800 text-white transition-transform group-open:rotate-0" />
          {title}
        </span>
        {extra}
      </summary>
      <div className="px-4 pb-5">{children}</div>
    </details>
  );
}

/** Three columns of label/field rows on wide screens, one column on phones. */
export function FieldGrid({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return <div className={cn("grid gap-x-10 gap-y-2.5", cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>{children}</div>;
}
export function FieldCol({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2.5">{children}</div>;
}

/** One label/control row: label right-aligned on the left, the control on the right (stacked on phones). */
export function Row({ label, htmlFor, children }: { label: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="grid items-center gap-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
      <Label htmlFor={htmlFor} className="text-ink sm:text-right">{label}</Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A read-only computed value shown in a gray box, like a locked field. */
export function ReadValue({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <div className={cn("min-h-9 rounded bg-paper-2 px-2.5 py-1.5 tabular-nums text-ink", align === "right" && "text-right")}>{children}</div>;
}

/** A tab's list panel: add button and toolbar on top, a title, the table, then a record count and pager. */
export function ListPanel({ title, actions, toolbar, total, pager, children }: {
  title: string; actions?: React.ReactNode; toolbar?: React.ReactNode; total: number; pager?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section data-panel aria-label={title} className="mt-4 rounded-lg border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div>
          {actions && <div className="flex flex-wrap items-start gap-3">{actions}</div>}
          <h2 className="mt-3 text-2xl font-bold">{title}</h2>
        </div>
        {toolbar && <div className="flex flex-wrap items-center gap-4 text-sm">{toolbar}</div>}
      </div>
      <div className="mt-3 overflow-x-auto border-t border-line">{children}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-1 text-sm">
        <span className="italic text-ink-soft">Total records: {total}</span>
        {pager}
      </div>
    </section>
  );
}

/** An outlined pill for the panel's main add action ("+ Add gift"). Renders a link, or wraps a <summary> label. */
export const pillCls = "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-teal-800 px-5 font-bold text-teal-800 hover:bg-paper-2";

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  const btn = "inline-flex min-h-11 items-center gap-0.5 rounded px-2.5 font-semibold text-teal-600 hover:bg-paper-2";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
      {page > 1 && <><Link className={btn} href={href(1)}><ChevronsLeft aria-hidden="true" size={15} />first</Link><Link className={btn} href={href(page - 1)}><ChevronLeft aria-hidden="true" size={15} />prev</Link></>}
      <span className="rounded bg-paper-2 px-2.5 py-1">Page {page} of {pages}</span>
      {page < pages && <><Link className={btn} href={href(page + 1)}>next<ChevronRight aria-hidden="true" size={15} /></Link><Link className={btn} href={href(pages)}>last<ChevronsRight aria-hidden="true" size={15} /></Link></>}
    </nav>
  );
}

export const thCls = "whitespace-nowrap bg-paper-2/60 px-3 py-2.5 text-sm font-semibold";
export const tdCls = "px-3 py-2.5 align-top";

export const PAGE_SIZE = 25;
export function paginate<T>(rows: T[], page: number) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  return { slice: rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), page: p, pages };
}
