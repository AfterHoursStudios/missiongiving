import { SETTLED_STATUSES } from "@/lib/donations/status";
import { projectProgress } from "@/lib/money";

export interface DonationRec {
  id: string; donor_id: string; amount_cents: number; refunded_cents: number; status: string;
  frequency: string; payment_method: string; designation: string; tier_title: string | null;
  settled_at: string | null; donated_at: string;
}
export interface RecurringRec { donor_id: string; amount_cents: number; frequency: string; status: string }
export interface ExpenseRec { expense_date: string; amount_cents: number; approval: string }
export interface ProjectRec { id: string; title: string; goal_cents: number | null; offline_adjustment_cents: number }

export interface Table { columns: string[]; rows: (string | number)[][]; kind: "line" | "bar" | "pie" | "progress" }

const SETTLED = SETTLED_STATUSES as readonly string[];
export const isSettled = (d: Pick<DonationRec, "status">) => SETTLED.includes(d.status);
export const netCents = (d: DonationRec) => d.amount_cents - d.refunded_cents;
const when = (d: DonationRec) => d.settled_at ?? d.donated_at;
const dollars = (c: number) => Math.round(c) / 100;

/** Calendar date parts of an instant in a time zone. */
export function zoned(iso: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}
const ymd = (p: { y: number; m: number; d: number }) => `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
const ym = (p: { y: number; m: number }) => `${p.y}-${String(p.m).padStart(2, "0")}`;
const dateKey = (iso: string, tz: string) => ymd(zoned(iso, tz));

export interface Kpi { current: number; previous: number; changePct: number | null }
const kpi = (current: number, previous: number): Kpi => ({ current, previous, changePct: previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10 });

export interface Kpis {
  today: Kpi; month: Kpi; year: Kpi;
  activeRecurringDonors: number; monthlyRecurringCents: number; yearlyRecurringCents: number;
  averageDonationCents: number; newDonorsThisMonth: number; returningDonorsThisMonth: number;
  pastDueRecurring: number; pendingAch: { count: number; cents: number };
}

export function computeKpis(donations: DonationRec[], recurring: RecurringRec[], now: Date, tz: string): Kpis {
  const t = zoned(now, tz);
  const prevDay = zoned(new Date(Date.UTC(t.y, t.m - 1, t.d - 1, 12)), "UTC");
  const prevMonth = zoned(new Date(Date.UTC(t.y, t.m - 2, 1, 12)), "UTC");
  const settled = donations.filter(isSettled);
  const sum = (f: (k: { day: string; month: string; year: number }) => boolean) =>
    settled.reduce((s, d) => { const p = zoned(when(d), tz); return f({ day: ymd(p), month: ym(p), year: p.y }) ? s + netCents(d) : s; }, 0);

  const first = firstGiftMonth(settled, tz);
  const monthKey = ym(t);
  const monthDonors = new Set(settled.filter((d) => ym(zoned(when(d), tz)) === monthKey).map((d) => d.donor_id));
  const isNew = (id: string) => first.get(id) === monthKey;
  const active = recurring.filter((r) => r.status === "active");
  const ytd = settled.filter((d) => zoned(when(d), tz).y === t.y);
  const pendingAch = donations.filter((d) => d.payment_method === "us_bank_account" && (d.status === "pending" || d.status === "processing"));

  return {
    today: kpi(sum((k) => k.day === ymd(t)), sum((k) => k.day === ymd(prevDay))),
    month: kpi(sum((k) => k.month === monthKey), sum((k) => k.month === ym(prevMonth))),
    year: kpi(sum((k) => k.year === t.y), sum((k) => k.year === t.y - 1)),
    activeRecurringDonors: new Set(active.map((r) => r.donor_id)).size,
    monthlyRecurringCents: active.filter((r) => r.frequency === "monthly").reduce((s, r) => s + r.amount_cents, 0),
    yearlyRecurringCents: active.filter((r) => r.frequency === "yearly").reduce((s, r) => s + r.amount_cents, 0),
    averageDonationCents: ytd.length ? Math.round(ytd.reduce((s, d) => s + netCents(d), 0) / ytd.length) : 0,
    newDonorsThisMonth: [...monthDonors].filter(isNew).length,
    returningDonorsThisMonth: [...monthDonors].filter((id) => !isNew(id)).length,
    pastDueRecurring: recurring.filter((r) => r.status === "past_due").length,
    pendingAch: { count: pendingAch.length, cents: pendingAch.reduce((s, d) => s + d.amount_cents, 0) },
  };
}

function firstGiftMonth(settled: DonationRec[], tz: string) {
  const first = new Map<string, string>();
  const sorted = [...settled].sort((a, b) => +new Date(when(a)) - +new Date(when(b)));
  for (const d of sorted) if (!first.has(d.donor_id)) first.set(d.donor_id, ym(zoned(when(d), tz)));
  return first;
}

export interface Range { from: string; to: string } // inclusive YYYY-MM-DD in the org zone

/** Default: the last 12 calendar months including the current one. */
export function defaultRange(now: Date, tz: string): Range {
  const t = zoned(now, tz);
  const start = new Date(Date.UTC(t.y, t.m - 12, 1, 12));
  return { from: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`, to: ymd(t) };
}
export function parseRange(from: string | undefined, to: string | undefined, fallback: Range): Range {
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  const r = { from: ok(from) ? from! : fallback.from, to: ok(to) ? to! : fallback.to };
  return r.from <= r.to ? r : fallback;
}

function monthsBetween(range: Range): string[] {
  const out: string[] = [];
  let [y, m] = range.from.split("-").map(Number);
  const [ey, em] = range.to.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); if (++m > 12) { m = 1; y++; } }
  return out;
}

export interface SeriesInput {
  donations: DonationRec[]; expenses: ExpenseRec[]; projects: ProjectRec[]; tz: string; range: Range;
}
export const SERIES_KEYS = [
  "revenue", "by-designation", "one-time-vs-recurring", "tiers", "payment-method", "new-vs-returning",
  "retention", "goal-progress", "revenue-expenses",
] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];
export const SERIES_TITLES: Record<SeriesKey, string> = {
  "revenue": "Donation revenue over time", "by-designation": "Donations by fund or project",
  "one-time-vs-recurring": "One-time versus recurring", "tiers": "Donation tiers", "payment-method": "Payment method",
  "new-vs-returning": "New versus returning donors", "retention": "Donor retention", "goal-progress": "Project goal progress",
  "revenue-expenses": "Revenue, expenses and net operating result",
};

export function buildSeries(key: SeriesKey, input: SeriesInput): Table {
  const { tz, range } = input;
  const inRange = (iso: string) => { const k = dateKey(iso, tz); return k >= range.from && k <= range.to; };
  const settled = input.donations.filter(isSettled);
  const scoped = settled.filter((d) => inRange(when(d)));
  const months = monthsBetween(range);
  const byMonth = (rows: DonationRec[]) => { const m = new Map<string, DonationRec[]>(); for (const d of rows) { const k = ym(zoned(when(d), tz)); m.set(k, [...(m.get(k) ?? []), d]); } return m; };
  const net = (rows: DonationRec[]) => rows.reduce((s, d) => s + netCents(d), 0);

  switch (key) {
    case "revenue": {
      const g = byMonth(scoped);
      return { kind: "line", columns: ["Month", "Net donations ($)", "Gifts"], rows: months.map((m) => [m, dollars(net(g.get(m) ?? [])), (g.get(m) ?? []).length]) };
    }
    case "by-designation": {
      const g = new Map<string, number>();
      for (const d of scoped) g.set(d.designation, (g.get(d.designation) ?? 0) + netCents(d));
      return { kind: "bar", columns: ["Fund or project", "Net donations ($)"], rows: [...g].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, dollars(v)]) };
    }
    case "one-time-vs-recurring": {
      const g = byMonth(scoped);
      const f = (m: string, freq: string) => dollars(net((g.get(m) ?? []).filter((d) => d.frequency === freq)));
      return { kind: "bar", columns: ["Month", "One time ($)", "Monthly ($)", "Yearly ($)"], rows: months.map((m) => [m, f(m, "one_time"), f(m, "monthly"), f(m, "yearly")]) };
    }
    case "tiers": {
      const g = new Map<string, { n: number; c: number }>();
      for (const d of scoped) { const k = d.tier_title ?? "Custom amount"; const v = g.get(k) ?? { n: 0, c: 0 }; g.set(k, { n: v.n + 1, c: v.c + netCents(d) }); }
      return { kind: "bar", columns: ["Tier", "Gifts", "Net donations ($)"], rows: [...g].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, v.n, dollars(v.c)]) };
    }
    case "payment-method": {
      const label: Record<string, string> = { card: "Card", us_bank_account: "Bank (ACH)", offline: "Offline" };
      const g = new Map<string, number>();
      for (const d of scoped) g.set(label[d.payment_method] ?? d.payment_method, (g.get(label[d.payment_method] ?? d.payment_method) ?? 0) + netCents(d));
      return { kind: "pie", columns: ["Payment method", "Net donations ($)"], rows: [...g].map(([k, v]) => [k, dollars(v)]) };
    }
    case "new-vs-returning": {
      const first = firstGiftMonth(settled, tz);
      const g = byMonth(scoped);
      return { kind: "bar", columns: ["Month", "New donors", "Returning donors"], rows: months.map((m) => {
        const ids = new Set((g.get(m) ?? []).map((d) => d.donor_id));
        const n = [...ids].filter((id) => first.get(id) === m).length;
        return [m, n, ids.size - n];
      }) };
    }
    case "retention": {
      const byYear = new Map<number, Set<string>>();
      for (const d of settled) { const y = zoned(when(d), tz).y; (byYear.get(y) ?? byYear.set(y, new Set()).get(y)!).add(d.donor_id); }
      const years = [...byYear.keys()].sort((a, b) => a - b);
      return { kind: "line", columns: ["Year", "Prior-year donors", "Gave again", "Retention (%)"], rows: years.slice(1).map((y) => {
        const prev = byYear.get(y - 1) ?? new Set<string>(); const cur = byYear.get(y)!;
        const kept = [...prev].filter((id) => cur.has(id)).length;
        return [String(y), prev.size, kept, prev.size ? Math.round((kept / prev.size) * 1000) / 10 : 0];
      }) };
    }
    case "goal-progress": {
      const raised = new Map<string, number>();
      for (const d of settled) raised.set(d.designation, (raised.get(d.designation) ?? 0) + netCents(d));
      return { kind: "progress", columns: ["Project", "Raised ($)", "Goal ($)", "Percent"], rows: input.projects.filter((p) => p.goal_cents).map((p) => {
        const pr = projectProgress(raised.get(p.title) ?? 0, p.offline_adjustment_cents, p.goal_cents);
        return [p.title, dollars(pr.raised), dollars(p.goal_cents!), pr.pct ?? 0];
      }) };
    }
    case "revenue-expenses": {
      const g = byMonth(scoped);
      const exp = new Map<string, number>();
      for (const e of input.expenses) if (e.approval === "approved" && e.expense_date >= range.from && e.expense_date <= range.to) { const k = e.expense_date.slice(0, 7); exp.set(k, (exp.get(k) ?? 0) + e.amount_cents); }
      return { kind: "bar", columns: ["Month", "Revenue ($)", "Expenses ($)", "Net operating result ($)"], rows: months.map((m) => {
        const r = net(g.get(m) ?? []); const e = exp.get(m) ?? 0;
        return [m, dollars(r), dollars(e), dollars(r - e)];
      }) };
    }
  }
}
