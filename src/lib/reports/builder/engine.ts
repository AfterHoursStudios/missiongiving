import { addMonths } from "../dashboard";
import { OPERATORS, fieldOf, type FieldDef, type ReportDefinition, type ReportFilter, type SourceKey } from "./fields";

/** A report row: field key → value. Dates "YYYY-MM-DD", money in cents, yes/no as booleans. */
export type Value = string | number | boolean | null;
export type Row = Record<string, Value>;

export interface ResultColumn { key: string; label: string; type: FieldDef["type"] }
export interface ResultSection { label: string | null; rows: Value[][]; count: number; totals: (number | null)[] }
export interface ReportResult { columns: ResultColumn[]; sections: ResultSection[]; count: number; totals: (number | null)[]; truncated: boolean }

const isBlank = (v: Value) => v === null || v === "";
const dollarsToCents = (s: string | undefined) => { const n = Number(String(s ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const num = (s: string | undefined) => Number(String(s ?? "").replace(/[,\s]/g, ""));

/** True when the row passes one filter. Filters that can't be evaluated (a missing value) don't exclude anything. */
export function matches(row: Row, f: ReportFilter, field: FieldDef, today: string): boolean {
  const v = row[field.key] ?? null;
  const op = OPERATORS[field.type].find((o) => o.value === f.op);
  if (!op) return true;
  if ((op.needs === "one" && !f.value?.trim()) || (op.needs === "two" && (!f.value?.trim() || !f.value2?.trim())) || (op.needs === "many" && !f.values?.length)) return true;

  switch (field.type) {
    case "text": {
      const s = String(v ?? "").toLowerCase(), q = (f.value ?? "").trim().toLowerCase();
      if (f.op === "blank") return isBlank(v);
      if (f.op === "not_blank") return !isBlank(v);
      if (f.op === "contains") return s.includes(q);
      if (f.op === "not_contains") return !s.includes(q);
      if (f.op === "equals") return s === q;
      if (f.op === "starts_with") return s.startsWith(q);
      return true;
    }
    case "money": case "number": {
      if (typeof v !== "number") return false;
      const parse = field.type === "money" ? dollarsToCents : num;
      const a = parse(f.value), b = parse(f.value2);
      if (Number.isNaN(a) || (f.op === "between" && Number.isNaN(b))) return true;
      if (f.op === "gte") return v >= a;
      if (f.op === "lte") return v <= a;
      if (f.op === "eq") return v === a;
      if (f.op === "between") return v >= Math.min(a, b) && v <= Math.max(a, b);
      return true;
    }
    case "date": {
      if (f.op === "blank") return isBlank(v);
      if (f.op === "not_blank") return !isBlank(v);
      if (typeof v !== "string" || !v) return false;
      const year = today.slice(0, 4);
      if (f.op === "this_year") return v.startsWith(year);
      if (f.op === "last_year") return v.startsWith(String(Number(year) - 1));
      if (f.op === "on_or_after") return v >= f.value!;
      if (f.op === "on_or_before") return v <= f.value!;
      if (f.op === "between") return v >= (f.value! < f.value2! ? f.value! : f.value2!) && v <= (f.value! < f.value2! ? f.value2! : f.value!);
      if (f.op === "last_days") {
        const days = Math.max(0, Math.floor(num(f.value)));
        if (!Number.isFinite(days)) return true;
        const from = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
        return v >= from && v <= today;
      }
      return true;
    }
    case "choice": {
      const inSet = (f.values ?? []).includes(String(v ?? ""));
      return f.op === "not_in" ? !inSet : inSet;
    }
    case "bool":
      return f.op === "true" ? v === true : v !== true;
  }
}

function compare(a: Value, b: Value): number {
  if (isBlank(a) && isBlank(b)) return 0;
  if (isBlank(a)) return 1; // blanks last, whichever direction
  if (isBlank(b)) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "en-US", { sensitivity: "base", numeric: true });
}

/** How a value reads on screen and in exports (money as $1,234.50). */
export function displayValue(field: Pick<FieldDef, "type" | "options">, v: Value): string {
  if (isBlank(v)) return "";
  if (field.type === "money" && typeof v === "number") return (v / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (field.type === "number" && typeof v === "number") return v.toLocaleString("en-US");
  if (field.type === "bool") return v ? "Yes" : "No";
  if (field.type === "choice") return field.options?.find((o) => o.value === v)?.label ?? String(v);
  if (field.type === "date" && typeof v === "string") { const [y, m, d] = v.split("-"); return `${m}/${d}/${y}`; }
  return String(v);
}

/**
 * Runs a (restricted) definition over rows: filters (all must match), sorts, groups with subtotals, and totals the
 * money and number columns. `limit` caps the rows returned (the totals still cover every matching row).
 */
export function runDefinition(rows: Row[], def: ReportDefinition, opts: { today: string; limit?: number }): ReportResult {
  const src: SourceKey = def.source;
  const columns = def.columns.map((k) => fieldOf(src, k)!).filter(Boolean).map((f) => ({ key: f.key, label: f.label, type: f.type }));
  const filters = def.filters.map((f) => ({ f, field: fieldOf(src, f.field)! })).filter((x) => x.field);
  const kept = rows.filter((r) => filters.every(({ f, field }) => matches(r, f, field, opts.today)));

  const sorts = def.sort.filter((s) => fieldOf(src, s.field));
  kept.sort((a, b) => {
    for (const s of sorts) { const c = compare(a[s.field], b[s.field]); if (c) return s.dir === "asc" ? c : -c; }
    return 0;
  });

  const sumOf = (list: Row[]) => columns.map((c) => (c.type === "money" || c.type === "number" ? list.reduce((t, r) => t + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0) : null));
  const toCells = (r: Row) => columns.map((c) => r[c.key] ?? null);
  const limit = opts.limit ?? Infinity;

  let sections: ResultSection[];
  const group = def.groupBy ? fieldOf(src, def.groupBy) : undefined;
  if (group) {
    const buckets = new Map<string, Row[]>();
    for (const r of kept) {
      const label = displayValue(group, r[group.key] ?? null) || "(blank)";
      const list = buckets.get(label) ?? [];
      list.push(r);
      buckets.set(label, list);
    }
    const dir = sorts.find((s) => s.field === group.key)?.dir ?? "asc";
    const order = [...buckets.keys()].sort((a, b) => {
      const ra = buckets.get(a)![0][group.key] ?? null, rb = buckets.get(b)![0][group.key] ?? null;
      return dir === "asc" ? compare(ra, rb) : -compare(ra, rb);
    });
    let shown = 0;
    sections = order.map((label) => {
      const list = buckets.get(label)!;
      const take = def.summaryOnly ? 0 : Math.max(0, Math.min(list.length, limit - shown));
      shown += take;
      return { label, rows: list.slice(0, take).map(toCells), count: list.length, totals: sumOf(list) };
    });
  } else {
    sections = [{ label: null, rows: kept.slice(0, limit).map(toCells), count: kept.length, totals: sumOf(kept) }];
  }
  const returned = sections.reduce((n, s) => n + s.rows.length, 0);
  return { columns, sections, count: kept.length, totals: sumOf(kept), truncated: !def.summaryOnly && returned < kept.length };
}

/** "Last 12 months" boundary used by the donor report's giving column. */
export const twelveMonthsBefore = (today: string) => addMonths(today, -12);
