import { z } from "zod";

/**
 * Report builder (Reports → Report builder): the report types, their fields, and the filter operators per field type.
 * Client-safe, so the builder UI and the server share one definition. Values: dates are "YYYY-MM-DD", money is cents.
 */
export type FieldType = "text" | "money" | "number" | "date" | "choice" | "bool";
export interface FieldDef {
  key: string; label: string; type: FieldType; group: string;
  /** Personal details (name, email, phone, address, notes): only for staff who can view donors. */
  pii?: boolean;
  options?: { value: string; label: string }[];
  /** Limits the filter conditions offered (default: every condition for the field's type). */
  ops?: string[];
}

const STATUS = [
  { value: "succeeded", label: "Succeeded" }, { value: "partially_refunded", label: "Partially refunded" }, { value: "refunded", label: "Refunded" },
  { value: "processing", label: "Processing" }, { value: "pending", label: "Pending" }, { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" }, { value: "disputed", label: "Disputed" },
];
const FREQUENCY = [
  { value: "one_time", label: "One time" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" },
  { value: "biweekly", label: "Bi-weekly" }, { value: "irregular", label: "Irregular schedule" },
];
const METHOD = [{ value: "card", label: "Card" }, { value: "us_bank_account", label: "Bank (ACH)" }, { value: "offline", label: "Offline" }];
const RESTRICTION = [{ value: "unrestricted", label: "Unrestricted" }, { value: "restricted", label: "Restricted" }];
const DONOR_STATUS = [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "lapsed", label: "Lapsed" }, { value: "do_not_contact", label: "Do not contact" }];

const DONOR_FIELDS: FieldDef[] = [
  { key: "donor_name", label: "Donor name", type: "text", group: "Donor", pii: true },
  { key: "first_name", label: "First name", type: "text", group: "Donor", pii: true },
  { key: "last_name", label: "Last name", type: "text", group: "Donor", pii: true },
  { key: "organization", label: "Organization", type: "text", group: "Donor", pii: true },
  { key: "email", label: "Email", type: "text", group: "Donor", pii: true },
  { key: "phone", label: "Phone", type: "text", group: "Donor", pii: true },
  { key: "address", label: "Street address", type: "text", group: "Donor", pii: true },
  { key: "city", label: "City", type: "text", group: "Donor", pii: true },
  { key: "state", label: "State / region", type: "text", group: "Donor" },
  { key: "postal_code", label: "ZIP / postal code", type: "text", group: "Donor", pii: true },
  { key: "country", label: "Country", type: "text", group: "Donor" },
  { key: "donor_status", label: "Donor status", type: "choice", group: "Donor", options: DONOR_STATUS },
  { key: "tags", label: "Tags", type: "text", group: "Donor" },
  { key: "donor_since", label: "Donor since", type: "date", group: "Donor" },
];

export const SOURCES = {
  gifts: {
    label: "Gifts", hint: "One row per gift, with the donor's details.",
    fields: [
      { key: "gift_date", label: "Gift date", type: "date", group: "Gift" },
      { key: "gift_year", label: "Gift year", type: "text", group: "Gift" },
      { key: "gift_month", label: "Gift month", type: "text", group: "Gift" },
      { key: "amount", label: "Gift amount", type: "money", group: "Gift" },
      { key: "refunded", label: "Refunded", type: "money", group: "Gift" },
      { key: "net", label: "Net amount", type: "money", group: "Gift" },
      { key: "fee", label: "Processing fee", type: "money", group: "Gift" },
      { key: "status", label: "Gift status", type: "choice", group: "Gift", options: STATUS },
      { key: "frequency", label: "Frequency", type: "choice", group: "Gift", options: FREQUENCY },
      { key: "payment_method", label: "Payment method", type: "choice", group: "Gift", options: METHOD },
      { key: "offline", label: "Offline gift", type: "bool", group: "Gift" },
      { key: "recurring", label: "Part of a recurring gift", type: "bool", group: "Gift" },
      { key: "designation", label: "Designation", type: "text", group: "Gift" },
      { key: "fund", label: "Fund", type: "text", group: "Gift" },
      { key: "restriction", label: "Restricted / unrestricted", type: "choice", group: "Gift", options: RESTRICTION },
      { key: "receipt_number", label: "Receipt number", type: "text", group: "Gift" },
      { key: "gift_note", label: "Gift note", type: "text", group: "Gift", pii: true },
      ...DONOR_FIELDS,
    ] as FieldDef[],
    defaultColumns: ["gift_date", "donor_name", "amount", "designation", "payment_method", "status"],
  },
  donors: {
    label: "Donors", hint: "One row per donor, with their giving totals.",
    fields: [
      ...DONOR_FIELDS,
      { key: "lifetime_giving", label: "Lifetime giving", type: "money", group: "Giving" },
      { key: "giving_12_months", label: "Giving, last 12 months", type: "money", group: "Giving" },
      { key: "gift_count", label: "Number of gifts", type: "number", group: "Giving" },
      { key: "first_gift_date", label: "First gift date", type: "date", group: "Giving" },
      { key: "first_gift_amount", label: "First gift amount", type: "money", group: "Giving" },
      { key: "last_gift_date", label: "Last gift date", type: "date", group: "Giving" },
      { key: "last_gift_amount", label: "Last gift amount", type: "money", group: "Giving" },
      { key: "largest_gift", label: "Largest gift", type: "money", group: "Giving" },
      { key: "recurring_active", label: "Has an active recurring gift", type: "bool", group: "Giving" },
      { key: "recurring_amount", label: "Active recurring amount", type: "money", group: "Giving" },
      // A Gift date filter sets the report's date range: it keeps donors who gave in it, and the two fields below total
      // their giving within it, e.g. "gave $5,000 or more in 2025".
      { key: "gift_date", label: "Gift date", type: "date", group: "Giving in date range", ops: ["between", "on_or_after", "on_or_before", "last_days", "this_year", "last_year"] },
      { key: "period_giving", label: "Giving in date range", type: "money", group: "Giving in date range" },
      { key: "period_gift_count", label: "Gifts in date range", type: "number", group: "Giving in date range" },
    ] as FieldDef[],
    defaultColumns: ["donor_name", "email", "lifetime_giving", "last_gift_date", "last_gift_amount"],
  },
} as const;
export type SourceKey = keyof typeof SOURCES;

export const OPERATORS: Record<FieldType, { value: string; label: string; needs: "none" | "one" | "two" | "many" }[]> = {
  text: [
    { value: "contains", label: "contains", needs: "one" }, { value: "not_contains", label: "does not contain", needs: "one" },
    { value: "equals", label: "is exactly", needs: "one" }, { value: "starts_with", label: "starts with", needs: "one" },
    { value: "blank", label: "is blank", needs: "none" }, { value: "not_blank", label: "is not blank", needs: "none" },
  ],
  money: [
    { value: "gte", label: "is at least", needs: "one" }, { value: "lte", label: "is at most", needs: "one" },
    { value: "eq", label: "equals", needs: "one" }, { value: "between", label: "is between", needs: "two" },
  ],
  number: [
    { value: "gte", label: "is at least", needs: "one" }, { value: "lte", label: "is at most", needs: "one" },
    { value: "eq", label: "equals", needs: "one" }, { value: "between", label: "is between", needs: "two" },
  ],
  date: [
    { value: "between", label: "is between", needs: "two" }, { value: "on_or_after", label: "is on or after", needs: "one" },
    { value: "on_or_before", label: "is on or before", needs: "one" }, { value: "last_days", label: "is in the last … days", needs: "one" },
    { value: "this_year", label: "is this calendar year", needs: "none" }, { value: "last_year", label: "is last calendar year", needs: "none" },
    { value: "blank", label: "is blank", needs: "none" }, { value: "not_blank", label: "is not blank", needs: "none" },
  ],
  choice: [{ value: "in", label: "is any of", needs: "many" }, { value: "not_in", label: "is none of", needs: "many" }],
  bool: [{ value: "true", label: "is yes", needs: "none" }, { value: "false", label: "is no", needs: "none" }],
};

export const fieldOf = (source: SourceKey, key: string): FieldDef | undefined => (SOURCES[source].fields as FieldDef[]).find((f) => f.key === key);

/** Donor-report fields totalled over the date range a Gift date filter sets. */
export const PERIOD_FIELDS = ["period_giving", "period_gift_count"];

/** The filter conditions a field offers. */
export const opsFor = (field: FieldDef) => OPERATORS[field.type].filter((o) => !field.ops || field.ops.includes(o.value));
const filterSchema = z.object({
  field: z.string().max(40), op: z.string().max(20),
  value: z.string().max(200).optional(), value2: z.string().max(200).optional(), values: z.array(z.string().max(60)).max(20).optional(),
});
export const definitionSchema = z.object({
  source: z.enum(["gifts", "donors"]),
  columns: z.array(z.string().max(40)).min(1, "Choose at least one column").max(30),
  filters: z.array(filterSchema).max(15),
  sort: z.array(z.object({ field: z.string().max(40), dir: z.enum(["asc", "desc"]) })).max(3),
  groupBy: z.string().max(40).nullable(),
  summaryOnly: z.boolean(),
});
export type ReportDefinition = z.infer<typeof definitionSchema>;
export type ReportFilter = z.infer<typeof filterSchema>;

export function defaultDefinition(source: SourceKey): ReportDefinition {
  return {
    source, columns: [...SOURCES[source].defaultColumns],
    // Gift reports start with settled gifts only, like every other report; remove the filter to see the rest.
    filters: source === "gifts" ? [{ field: "status", op: "in", values: ["succeeded", "partially_refunded", "refunded"] }, { field: "gift_date", op: "this_year" }] : [],
    sort: [{ field: source === "gifts" ? "gift_date" : "lifetime_giving", dir: "desc" }], groupBy: null, summaryOnly: false,
  };
}

/**
 * Drops anything the definition names that isn't a field of its report type, or (without donors.view) is a personal
 * detail. Returns the cleaned definition and the labels of what was removed, so the screen can say so.
 */
/** The fields a definition uses anywhere: columns, filters, sorting and grouping. */
const usedFields = (def: ReportDefinition) => [...def.columns, ...def.filters.map((f) => f.field), ...def.sort.map((s) => s.field), ...(def.groupBy ? [def.groupBy] : [])];

const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The date range a donor report's Gift date filters set (several narrow it), or null when there's no complete one.
 * `today` is "YYYY-MM-DD" in the organization's time zone.
 */
export function resolvePeriod(def: ReportDefinition, today: string): { from: string; to: string } | null {
  if (def.source !== "donors") return null;
  let range = null as { from: string; to: string } | null;
  for (const f of def.filters) {
    if (f.field !== "gift_date") continue;
    const a = f.value?.trim() ?? "", b = f.value2?.trim() ?? "", year = Number(today.slice(0, 4));
    let r: { from: string; to: string } | null = null;
    if (f.op === "between" && a && b) r = a <= b ? { from: a, to: b } : { from: b, to: a };
    else if (f.op === "on_or_after" && a) r = { from: a, to: "9999-12-31" };
    else if (f.op === "on_or_before" && a) r = { from: "0000-01-01", to: a };
    else if (f.op === "last_days" && a && Number.isFinite(Number(a))) r = { from: addDays(today, -Math.max(0, Math.floor(Number(a)))), to: today };
    else if (f.op === "this_year") r = { from: `${year}-01-01`, to: `${year}-12-31` };
    else if (f.op === "last_year") r = { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    if (r) range = range ? { from: r.from > range.from ? r.from : range.from, to: r.to < range.to ? r.to : range.to } : r;
  }
  return range;
}

/** An error when a donor report uses a date-range field without a complete Gift date filter to set the dates. */
export function periodError(def: ReportDefinition): string | undefined {
  if (def.source !== "donors" || !usedFields(def).some((k) => PERIOD_FIELDS.includes(k))) return undefined;
  // Any "today" will do: whether a filter is complete doesn't depend on the date.
  if (resolvePeriod(def, "2000-01-01")) return undefined;
  return "Add a Gift date filter (and fill in its dates) to set the date range for Giving in date range and Gifts in date range.";
}

export function restrictDefinition(def: ReportDefinition, canViewDonors: boolean): { def: ReportDefinition; removed: string[] } {
  const removed = new Set<string>();
  const ok = (key: string) => {
    const f = fieldOf(def.source, key);
    if (f && (!f.pii || canViewDonors)) return true;
    removed.add(f?.label ?? key);
    return false;
  };
  const filters = def.filters.filter((f) => ok(f.field) && opsFor(fieldOf(def.source, f.field)!).some((o) => o.value === f.op));
  return {
    def: {
      ...def, columns: def.columns.filter(ok), filters, sort: def.sort.filter((s) => ok(s.field)),
      groupBy: def.groupBy && ok(def.groupBy) ? def.groupBy : null,
    },
    removed: [...removed],
  };
}
