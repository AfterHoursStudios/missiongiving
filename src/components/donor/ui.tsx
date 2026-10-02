import { Clock, DollarSign, Gift, Heart, RefreshCw, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type DonationStatus } from "@/lib/donations/status";

const TONE: Record<DonationStatus, string> = {
  succeeded: "bg-success-bg text-success",
  pending: "bg-info-bg text-info", processing: "bg-info-bg text-info",
  failed: "bg-danger-bg text-danger", disputed: "bg-danger-bg text-danger",
  refunded: "bg-warning-bg text-warning", partially_refunded: "bg-warning-bg text-warning",
  canceled: "bg-paper-2 text-ink-soft",
};

/** Status is conveyed by text, not color alone. */
export function StatusBadge({ status }: { status: string }) {
  const s = status as DonationStatus;
  return <span className={cn("inline-block rounded px-2 py-0.5 text-sm font-semibold", TONE[s] ?? "bg-paper-2")}>{STATUS_LABELS[s] ?? status}</span>;
}

/**
 * A white panel on the gray app workspace, like the admin's: optional title row (with an action on the right), then content.
 * `flush` drops the body padding for lists and tables that run edge to edge.
 */
export function Panel({ title, id, action, flush, className, children }: {
  title?: React.ReactNode; id?: string; action?: React.ReactNode; flush?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <section data-panel aria-labelledby={title && id ? id : undefined} className={cn("rounded-lg border border-line bg-white shadow-sm", className)}>
      {(title || action) && (
        <div className={cn("flex flex-wrap items-center justify-between gap-2 px-4 pt-4", flush ? "pb-3" : "pb-0")}>
          {title && <h2 id={id} className="text-xl font-bold">{title}</h2>}
          {action}
        </div>
      )}
      <div className={cn(flush ? (title || action ? "border-t border-line" : "") : "p-4")}>{children}</div>
    </section>
  );
}

/** An empty state: a white panel of its own, or (with `bare`) just the message when it already sits inside a Panel. */
export function Empty({ title, bare, children }: { title: string; bare?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("px-4 py-10 text-center", !bare && "rounded-lg border border-line bg-white shadow-sm")}>
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mt-2 text-ink-soft">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="font-display text-3xl font-semibold text-brand-800">{value}</dd>
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

const STAT_ICON_TONE = {
  brand: "bg-brand-50 text-brand-800", teal: "bg-info-bg text-info", gold: "bg-warning-bg text-warning",
  success: "bg-success-bg text-success", danger: "bg-danger-bg text-danger",
} as const;

/** A stand-alone stat tile: icon chip, label, big value, optional hint — for header summary rows on detail pages. */
export function StatCard({ icon: Icon, tone = "brand", label, value, hint }: {
  icon: LucideIcon; tone?: keyof typeof STAT_ICON_TONE; label: string; value: React.ReactNode; hint?: React.ReactNode;
}) {
  return (
    <div className="min-w-[8rem] rounded-md border border-line bg-white p-3">
      <span aria-hidden="true" className={cn("inline-flex size-8 items-center justify-center rounded-full", STAT_ICON_TONE[tone])}><Icon size={16} /></span>
      <dt className="mt-2 text-sm text-ink-soft">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
      {hint && <div className="text-sm text-ink-soft">{hint}</div>}
    </div>
  );
}
export const STAT_ICONS = { lastGift: Clock, totalGifts: Gift, totalGiven: DollarSign } as const;

const BADGE_TONE = { brand: "bg-brand-50 text-brand-800", teal: "bg-info-bg text-info", gold: "bg-warning-bg text-warning", neutral: "bg-paper-2 text-ink" } as const;
const BADGE_ICON = { "Monthly Donor": RefreshCw, "Sponsor": Heart } as Record<string, LucideIcon>;

/** A small pill used for donor status flags and tags on the donor header card. Known labels get a matching icon automatically. */
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONE; children: React.ReactNode }) {
  const Icon = typeof children === "string" ? BADGE_ICON[children] ?? Tag : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold", BADGE_TONE[tone])}>
      {Icon && <Icon aria-hidden="true" size={14} />}{children}
    </span>
  );
}

/**
 * Status words used across the admin (donors, projects, campaigns, expenses, tiers, staff) mapped to one shared color meaning,
 * so "active" always reads the same shade wherever it appears. Unknown statuses fall back to neutral rather than guessing.
 */
const STATUS_DOT_TONE: Record<string, string> = {
  active: "bg-success", approved: "bg-success", sent: "bg-success", completed: "bg-success", goal_reached: "bg-success", true: "bg-success",
  pending: "bg-warning", scheduled: "bg-info", paused: "bg-warning", past_due: "bg-warning", lapsed: "bg-warning", draft: "bg-info",
  inactive: "bg-ink-soft", archived: "bg-ink-soft", canceled: "bg-ink-soft", false: "bg-ink-soft",
  rejected: "bg-danger", failed: "bg-danger", disputed: "bg-danger", do_not_contact: "bg-danger",
};

/** A status dot plus label, closer to how an "ACTIVE" badge reads on a CRM profile card than a filled pill. Used for any status word site-wide. */
export function StatusDot({ status, label }: { status: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-ink-soft">
      <span aria-hidden="true" className={cn("size-2 rounded-full", STATUS_DOT_TONE[status] ?? "bg-ink-soft")} />
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

/** One item in a query-param tab bar (?tab=key), server-rendered so it works without client JS. Optional subtitle for a denser, two-line tab. */
export function TabLink({ href, active, subtitle, children }: { href: string; active: boolean; subtitle?: string; children: React.ReactNode }) {
  return (
    <a href={href} aria-current={active ? "page" : undefined}
      className={cn("min-h-11 rounded-t-md border-b-2 px-4 py-2 leading-tight", active ? "border-brand-700 bg-white font-semibold text-ink" : "border-transparent text-ink-soft hover:text-ink")}>
      <span className="block font-semibold">{children}</span>
      {subtitle && <span className="block text-xs text-ink-soft">{subtitle}</span>}
    </a>
  );
}

/** A funded/remaining progress bar, e.g. for a partly-sponsored woman. `label`/`hint` sit above it like a Stat. */
export function ProgressBar({ label, hint, fundedCents, totalCents }: { label?: string; hint?: string; fundedCents: number; totalCents: number }) {
  const pct = totalCents > 0 ? Math.min(100, Math.round((fundedCents / totalCents) * 100)) : 0;
  return (
    <div>
      {(label || hint) && (
        <div className="flex items-baseline justify-between gap-2 text-sm">
          {label && <span className="font-semibold">{label}</span>}
          {hint && <span className="text-ink-soft">{hint}</span>}
        </div>
      )}
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Funded"}
        className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-paper-2">
        <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const FREQUENCY_LABEL: Record<string, string> = { one_time: "One time", monthly: "Monthly", yearly: "Yearly" };
export const METHOD_LABEL: Record<string, string> = { card: "Card", us_bank_account: "Bank (ACH)", offline: "Offline" };
