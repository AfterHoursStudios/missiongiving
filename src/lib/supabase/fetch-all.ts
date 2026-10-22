/**
 * Supabase (PostgREST) returns at most 1,000 rows per request, whatever `.limit()` asks for. Reports and dashboards
 * that need every row use this instead: it requests pages of 1,000, ordered by unique column(s) so no row is skipped
 * or repeated between pages, until a short page comes back.
 *
 * `make` builds a fresh query each time (a Supabase query can only be run once). The result has the same shape as an
 * ordinary query ({ data, error }), with the row type inferred from the query, so call sites barely change.
 */
const PAGE = 1000;

type Result = { data: unknown; error: { message: string } | null };
interface Pageable { order(column: string, options?: { ascending?: boolean }): Pageable; range(from: number, to: number): PromiseLike<Result> }
type Rows<Q> = Q extends PromiseLike<{ data: infer D }> ? NonNullable<D> : never;

export async function fetchAll<Q extends PromiseLike<Result>>(
  make: () => Q, opts: { orderBy?: string | string[]; max?: number } = {},
): Promise<{ data: Rows<Q>; error: { message: string } | null }> {
  const order = Array.isArray(opts.orderBy) ? opts.orderBy : [opts.orderBy ?? "id"];
  const max = opts.max ?? 500_000;
  const out: unknown[] = [];
  for (let from = 0; from < max; from += PAGE) {
    let q = make() as unknown as Pageable;
    for (const col of order) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: out as unknown as Rows<Q>, error: null };
}
