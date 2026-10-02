import Link from "next/link";
import { Clock, DollarSign, Gift, Heart, RefreshCw, Star, Tag, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";

export interface HeaderDonor { first_name: string; last_name: string; email: string; phone: string | null; status: string; organization_name: string | null; dp_id?: string | null }

/** The donor record's summary row: a profile card (who, how to reach them, flags) followed by headline giving stats. */
export function DonorHeader({ donor, flags, stats }: {
  donor: HeaderDonor;
  flags: { label: string; on: boolean; icon: "monthly" | "sponsor" | "tag" }[];
  stats: { icon: "score" | "lastGift" | "totalGifts" | "totalGiven" | "monthly"; label: string; value: React.ReactNode; hint?: React.ReactNode }[];
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-0 flex-wrap gap-5 rounded-lg border border-line bg-white p-4 shadow-sm sm:flex-nowrap">
        <div className="flex flex-col items-center gap-1.5">
          <span aria-hidden="true" className="flex size-20 items-center justify-center rounded-full border-2 border-brand-500/40 bg-paper-2 text-ink-soft"><User size={40} /></span>
          <span className={cn("text-sm font-bold uppercase tracking-wide", STATUS_DOT_TONE_TEXT[donor.status] ?? "text-ink-soft")}>{donor.status.replace(/_/g, " ")}</span>
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{donor.first_name} {donor.last_name}</h1>
          {donor.dp_id && <span className="inline-block rounded bg-teal-800 px-1.5 text-sm font-bold text-white">DP ID {donor.dp_id}</span>}
          {donor.organization_name && <p className="text-sm text-ink-soft">{donor.organization_name}</p>}
          {donor.phone && <p className="mt-1">{formatPhone(donor.phone)}</p>}
          <p className="mt-1 break-all">{isPlaceholderEmail(donor.email) ? <span className="italic text-ink-soft">No email on file</span> : <a className="text-teal-600 underline" href={`mailto:${donor.email}`}>{donor.email}</a>}</p>
        </div>
        <ul aria-label="Donor flags" className="space-y-1.5 border-line text-sm sm:border-l sm:pl-5">
          {flags.map((f) => {
            const Icon = FLAG_ICON[f.icon];
            return (
              <li key={f.label} className={cn("flex items-center gap-2 font-semibold", f.on ? "text-ink" : "text-ink-soft/60")}>
                <Icon aria-hidden="true" size={18} className={f.on ? "text-teal-600" : ""} />
                {f.label}{!f.on && <span className="sr-only"> (no)</span>}
              </li>
            );
          })}
        </ul>
      </div>
      {stats.map((s) => {
        const { icon: Icon, tone } = STAT[s.icon];
        return (
          <div key={s.label} className="min-w-[10rem] flex-1 rounded-lg border border-line bg-white p-4 shadow-sm sm:max-w-[14rem]">
            <span aria-hidden="true" className={cn("inline-flex size-7 items-center justify-center rounded-full text-white", tone)}><Icon size={15} /></span>
            <p className="mt-3 text-sm text-ink-soft">{s.label}</p>
            <p className="text-xl font-bold tabular-nums">{s.value}</p>
            {s.hint && <p className="mt-1 text-sm text-ink-soft">{s.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

const STATUS_DOT_TONE_TEXT: Record<string, string> = { active: "text-success", lapsed: "text-warning", inactive: "text-ink-soft", do_not_contact: "text-danger" };
const FLAG_ICON: Record<string, LucideIcon> = { monthly: RefreshCw, sponsor: Heart, tag: Tag };
const STAT: Record<string, { icon: LucideIcon; tone: string }> = {
  score: { icon: Star, tone: "bg-teal-800" },
  lastGift: { icon: Clock, tone: "bg-gold" }, totalGifts: { icon: Gift, tone: "bg-teal-600" },
  totalGiven: { icon: DollarSign, tone: "bg-success" }, monthly: { icon: RefreshCw, tone: "bg-brand-600" },
};

export interface RecordTab { key: string; label: string; subtitle: string; count?: number }

/** The record's tab bar: label over a short subtitle, the active tab raised in white. */
export function RecordTabs({ tabs, active, href }: { tabs: RecordTab[]; active: string; href: (k: string) => string }) {
  return (
    <nav aria-label="Donor record sections" className="mt-5 overflow-x-auto rounded-t-lg border border-b-0 border-line bg-paper-2">
      <ul className="flex min-w-max">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link href={href(t.key)} aria-current={on ? "page" : undefined}
                className={cn("block min-h-11 px-5 py-2.5 leading-tight", on ? "bg-white" : "hover:bg-white/60")}>
                <span className={cn("text-lg font-semibold", on ? "text-ink" : "text-teal-600")}>{t.label}</span>
                <span className="block text-sm text-ink-soft">{t.subtitle}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The white strip under the tabs that holds a tab's quick actions. */
export function TabToolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-b-lg border border-t-0 border-line bg-white px-4 py-3 text-sm shadow-sm">{children}</div>;
}
