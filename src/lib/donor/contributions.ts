export interface ContributionRow {
  id: string; donated_at: string; amount_cents: number; payment_method: string; frequency: string; status: string;
  designation: string; receipt_number: string | null;
}

export interface ContributionFilter { q?: string; status?: string; frequency?: string; year?: number; page?: number }

export const PAGE_SIZE = 15;

/** Search matches designation or receipt number. Pure so it can be unit-tested. */
export function filterContributions(rows: ContributionRow[], f: ContributionFilter, yearOf: (iso: string) => number) {
  const q = f.q?.trim().toLowerCase();
  const filtered = rows.filter((r) =>
    (!f.status || r.status === f.status) &&
    (!f.frequency || r.frequency === f.frequency) &&
    (!f.year || yearOf(r.donated_at) === f.year) &&
    (!q || r.designation.toLowerCase().includes(q) || (r.receipt_number ?? "").toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  return { total: filtered.length, pages, page, rows: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}
