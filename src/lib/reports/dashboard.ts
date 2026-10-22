/**
 * Organization Dashboard numbers (Reports → Dashboard), modeled on DonorPerfect's. Pure: callers pass settled gifts
 * (net of refunds) with the date they count on, already converted to the organization's time zone as "YYYY-MM-DD".
 *
 * Periods are rolling 12 months ending today, so a number is never distorted early in a calendar year:
 * "this year" = the last 12 months, "last year" = the 12 months before that.
 */
export interface DashGift { donorId: string; net: number; date: string }

export interface DashKpi { value: number; previous: number; changePct: number | null }
export interface Dashboard {
  goal: { cents: number | null; raised: number; pct: number | null; fiscalYearLabel: string };
  kpis: {
    growth: { pct: number | null; deltaCents: number; previousPct: number | null };
    retention: { pct: number | null; previousPct: number | null; changePts: number | null };
    donors: DashKpi; averageGift: DashKpi; lifetimeValue: DashKpi;
  };
  /** Each of the last 12 months: giving that month and in the same month a year earlier. */
  monthlyGiving: { month: string; current: number; previous: number }[];
  /** Rolling 12-month retention at the end of each of the last 12 months, and a year earlier. */
  retentionTrend: { month: string; current: number | null; previous: number | null }[];
  /** Giving by calendar month for this calendar year and the two before. */
  historyCycle: { years: number[]; rows: { month: string; values: number[] }[] };
  /** Donor counts by status, this year and last year. Lapsed is negative (donors lost). */
  statuses: { status: string; current: number; previous: number }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pct = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / prev) * 1000) / 10);
const kpi = (value: number, previous: number): DashKpi => ({ value, previous, changePct: pct(value, previous) });

/** "YYYY-MM-DD" shifted by whole months (day clamped to the month's length). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
const monthEnd = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const ymOf = (date: string) => date.slice(0, 7);
const label = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

/** Gifts with from < date <= to. */
const within = (gifts: DashGift[], from: string, to: string) => gifts.filter((g) => g.date > from && g.date <= to);
const donorsIn = (gifts: DashGift[]) => new Set(gifts.map((g) => g.donorId));
const sum = (gifts: DashGift[]) => gifts.reduce((s, g) => s + g.net, 0);

/** Share of donors who gave in the 12 months before `end - 12 months` who gave again in the 12 months up to `end`. */
function retentionAt(gifts: DashGift[], end: string): number | null {
  const start = addMonths(end, -12), before = addMonths(end, -24);
  const prior = donorsIn(within(gifts, before, start));
  if (prior.size === 0) return null;
  const now = donorsIn(within(gifts, start, end));
  let kept = 0;
  for (const d of prior) if (now.has(d)) kept++;
  return Math.round((kept / prior.size) * 1000) / 10;
}

/** New / Retained / Reactivated / Lapsed for the 12 months ending `end`. */
function statusCounts(gifts: DashGift[], end: string) {
  const start = addMonths(end, -12), before = addMonths(end, -24);
  const now = donorsIn(within(gifts, start, end)), prior = donorsIn(within(gifts, before, start));
  const earlier = donorsIn(gifts.filter((g) => g.date <= before));
  let fresh = 0, retained = 0, reactivated = 0, lapsed = 0;
  for (const d of now) {
    if (prior.has(d)) retained++;
    else if (earlier.has(d)) reactivated++;
    else fresh++;
  }
  for (const d of prior) if (!now.has(d)) lapsed++;
  return { fresh, retained, reactivated, lapsed };
}

/** Average lifetime giving per donor, counting only gifts up to `asOf`. */
function lifetimeValue(gifts: DashGift[], asOf: string) {
  const upTo = gifts.filter((g) => g.date <= asOf);
  const donors = donorsIn(upTo).size;
  return donors === 0 ? 0 : Math.round(sum(upTo) / donors);
}

export function buildDashboard(gifts: DashGift[], opts: { today: string; fiscalStartMonth: number; goalCents: number | null }): Dashboard {
  const { today } = opts;
  const yearAgo = addMonths(today, -12), twoYearsAgo = addMonths(today, -24), threeYearsAgo = addMonths(today, -36);
  const cur = within(gifts, yearAgo, today), prev = within(gifts, twoYearsAgo, yearAgo), prev2 = within(gifts, threeYearsAgo, twoYearsAgo);

  // Fiscal year to date, for the goal bar.
  const [ty, tm] = today.split("-").map(Number);
  const fyStartYear = tm >= opts.fiscalStartMonth ? ty : ty - 1;
  const fyStart = `${fyStartYear}-${String(opts.fiscalStartMonth).padStart(2, "0")}-01`;
  const raised = sum(gifts.filter((g) => g.date >= fyStart && g.date <= today));
  const fyLabel = opts.fiscalStartMonth === 1 ? String(fyStartYear) : `${fyStartYear}–${String(fyStartYear + 1).slice(2)}`;

  const avg = (g: DashGift[]) => (g.length ? Math.round(sum(g) / g.length) : 0);
  const retention = retentionAt(gifts, today), retentionPrev = retentionAt(gifts, yearAgo);

  const thisMonth = ymOf(today);
  const months = Array.from({ length: 12 }, (_, i) => ymOf(addMonths(`${thisMonth}-01`, i - 11)));
  const byMonth = new Map<string, number>();
  for (const g of gifts) byMonth.set(ymOf(g.date), (byMonth.get(ymOf(g.date)) ?? 0) + g.net);

  const years = [ty - 2, ty - 1, ty];
  return {
    goal: { cents: opts.goalCents, raised, pct: opts.goalCents ? Math.round((raised / opts.goalCents) * 1000) / 10 : null, fiscalYearLabel: fyLabel },
    kpis: {
      growth: { pct: pct(sum(cur), sum(prev)), deltaCents: sum(cur) - sum(prev), previousPct: pct(sum(prev), sum(prev2)) },
      retention: { pct: retention, previousPct: retentionPrev, changePts: retention !== null && retentionPrev !== null ? Math.round((retention - retentionPrev) * 10) / 10 : null },
      donors: kpi(donorsIn(cur).size, donorsIn(prev).size),
      averageGift: kpi(avg(cur), avg(prev)),
      lifetimeValue: kpi(lifetimeValue(gifts, today), lifetimeValue(gifts, yearAgo)),
    },
    monthlyGiving: months.map((m) => ({ month: label(m), current: byMonth.get(m) ?? 0, previous: byMonth.get(ymOf(addMonths(`${m}-01`, -12))) ?? 0 })),
    retentionTrend: months.map((m) => {
      // The current month is still in progress: measure it up to today.
      const end = m === thisMonth ? today : monthEnd(m);
      return { month: label(m), current: retentionAt(gifts, end), previous: retentionAt(gifts, addMonths(end, -12)) };
    }),
    historyCycle: {
      years,
      rows: MONTHS.map((name, i) => ({ month: name, values: years.map((y) => byMonth.get(`${y}-${String(i + 1).padStart(2, "0")}`) ?? 0) })),
    },
    statuses: (() => {
      const a = statusCounts(gifts, today), b = statusCounts(gifts, yearAgo);
      return [
        { status: "New", current: a.fresh, previous: b.fresh },
        { status: "Retained", current: a.retained, previous: b.retained },
        { status: "Reactivated", current: a.reactivated, previous: b.reactivated },
        { status: "Lapsed", current: -a.lapsed, previous: -b.lapsed },
      ];
    })(),
  };
}

/** US states by postal code, for matching donor addresses ("WA" or "Washington") to the map. */
export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};
const BY_NAME = new Map(Object.values(US_STATES).map((n) => [n.toLowerCase(), n]));

/** The state's full name for a donor's region, or null when it isn't a US state. */
export function stateName(region: string | null | undefined): string | null {
  const r = region?.trim().replace(/\./g, "");
  if (!r) return null;
  return US_STATES[r.toUpperCase()] ?? BY_NAME.get(r.toLowerCase()) ?? null;
}

/** Net giving by US state over gifts already limited to the period. */
export function givingByState(gifts: DashGift[], regionOf: (donorId: string) => string | null | undefined): { state: string; cents: number; donors: number }[] {
  const acc = new Map<string, { cents: number; donors: Set<string> }>();
  for (const g of gifts) {
    const s = stateName(regionOf(g.donorId));
    if (!s) continue;
    const e = acc.get(s) ?? { cents: 0, donors: new Set<string>() };
    e.cents += g.net; e.donors.add(g.donorId);
    acc.set(s, e);
  }
  return [...acc].map(([state, e]) => ({ state, cents: e.cents, donors: e.donors.size })).sort((a, b) => b.cents - a.cents);
}

/** organization_settings key holding the Dashboard's annual fundraising goal (cents, or null). */
export const GOAL_SETTING = "annual_fundraising_goal_cents";
