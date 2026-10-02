import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Clock, Copy, FileDown, PauseCircle, RefreshCw, UserCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { DONOR_PAGE_SIZE, donorQuerySchema, queryDonors, type DonorQuery } from "@/lib/admin/donors";
import { formatMoney } from "@/lib/money";
import { StatusDot } from "@/components/donor/ui";
import { CreateTodoButton, TodoDialogProvider } from "@/components/admin/todo-dialog";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";
import { scoreTier } from "@/lib/admin/donor-score";
import { lastFirst } from "@/lib/donor-name";
import { paymentSummaries, type PaymentSummary } from "@/lib/admin/payment-on-file";

type LastGifts = Map<string, { here?: { cents: number; at: string }; dpCents: number | null }>;

/** Last gift amounts for this page's donors (this system's newest settled gift + the DonorPerfect last gift). Only needed until migration 0017 adds them to the view. */
async function lastGiftsFallback(ids: string[]): Promise<LastGifts> {
  const db = createSupabaseAdminClient();
  const [{ data: gifts }, { data: dp }] = await Promise.all([
    db.from("donations").select("donor_id, amount_cents, donated_at, settled_at")
      .in("donor_id", ids).in("status", ["succeeded", "partially_refunded", "refunded"]).order("donated_at", { ascending: false }).limit(2000),
    db.from("donor_profiles").select("id, dp_last_gift_cents").in("id", ids),
  ]);
  const m: LastGifts = new Map((dp ?? []).map((d) => [d.id as string, { dpCents: (d.dp_last_gift_cents as number | null) ?? null }]));
  for (const g of gifts ?? []) { const e = m.get(g.donor_id); if (e && !e.here) e.here = { cents: g.amount_cents, at: g.settled_at ?? g.donated_at }; }
  return m;
}

/** Payment type and expiry for this page's donors (live from Stripe; only the rows on screen). */
async function loadPayments(ids: string[]) {
  if (ids.length === 0) return new Map<string, PaymentSummary>();
  const { data } = await createSupabaseAdminClient().from("donor_profiles").select("id, stripe_customer_id").in("id", ids);
  return paymentSummaries((data ?? []) as { id: string; stripe_customer_id: string | null }[]);
}

/** Active staff for the to-do "Assigned to" list. */
async function activeStaff() {
  const { data } = await createSupabaseAdminClient().from("staff_profiles").select("user_id, display_name").eq("active", true).order("display_name");
  return (data ?? []).map((s) => ({ id: s.user_id as string, name: s.display_name as string }));
}

/** Segment card counts: head-only counts over donor_summary, so no rows are transferred. */
async function segmentCounts() {
  const db = createSupabaseAdminClient();
  const base = () => db.from("donor_summary").select("id", { count: "exact", head: true });
  const results = await Promise.all([
    base(),
    base().eq("status", "active"),
    base().gt("active_recurring", 0),
    base().eq("status", "lapsed"),
    base().in("status", ["inactive", "do_not_contact"]),
  ]);
  const [all, active, monthly, lapsed, inactive] = results.map((r) => r.count ?? 0);
  return { all, active, monthly, lapsed, inactive };
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Donors" };

const th = "whitespace-nowrap px-4 py-3 font-semibold";
const td = "px-4 py-3 align-middle";
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const toolLink = "inline-flex min-h-11 items-center gap-1.5 text-teal-600 hover:underline";

/** A sortable column header: label plus a direction arrow, or a neutral up/down icon when it isn't the active sort. */
function SortHead({ href, dir, children }: { href: string; dir: "asc" | "desc" | null; children: React.ReactNode }) {
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 hover:underline">
      {children}<Icon aria-hidden="true" size={15} className={dir ? "text-ink" : "text-ink-soft"} />
    </Link>
  );
}

type ListRow = Record<string, unknown> & { lifetime_cents: number; gift_count: number; last_gift_at: string | null; dp_total_given_cents: number | null; dp_gift_count: number | null; dp_last_gift_at: string | null };

/** The row's combined DonorPerfect + Mission Giving figures (from the view after migration 0017, computed here before it). */
function listFigures(d: ListRow, fallback: LastGifts) {
  const dpAt = d.dp_last_gift_at ? `${d.dp_last_gift_at}T12:00:00` : null;
  const lastAt = (d.latest_gift_at as string | null | undefined) ?? (d.last_gift_at && (!dpAt || d.last_gift_at >= dpAt) ? d.last_gift_at : dpAt);
  return {
    totalCents: (d.total_given_cents as number | undefined) ?? d.lifetime_cents + (d.dp_total_given_cents ?? 0),
    gifts: (d.total_gifts as number | undefined) ?? d.gift_count + (d.dp_gift_count ?? 0),
    lastAt: lastAt && /^\d{4}-\d{2}-\d{2}$/.test(lastAt) ? `${lastAt}T12:00:00` : lastAt,
    lastCents: "latest_gift_cents" in d
      ? (d.latest_gift_cents as number | null) ?? null
      // Before migration 0017: the newer of this system's last gift and the DonorPerfect last gift.
      : (() => { const f = fallback.get(d.id as string); return f?.here && (!dpAt || f.here.at >= dpAt) ? f.here.cents : f?.dpCents ?? f?.here?.cents ?? null; })(),
  };
}

/** The donor score in an outlined box, coloured by band: green High (70–100), gold Medium (40–69), red Low (0–39). */
function ScoreBadge({ score }: { score: number | null | undefined }) {
  const tier = scoreTier(score);
  if (!tier) return <span className="text-ink-soft">—</span>;
  const tone = { high: "border-success text-success", medium: "border-gold-dark text-gold-dark", low: "border-danger text-danger" }[tier];
  return <span title={`${tier[0].toUpperCase()}${tier.slice(1)} score`} className={`inline-block min-w-11 rounded border-2 px-1.5 text-center text-sm font-bold tabular-nums ${tone}`}>{score}</span>;
}

const noFilters = (q: DonorQuery) => !q.q && !q.status && !q.tag && !q.recurring && q.min === undefined;

export default async function DonorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, perms } = await requirePermission("donors.view");
  const canTodo = perms.has("donors.edit");
  const raw = await searchParams;
  const parsed = donorQuerySchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v)));
  const query = parsed.success ? parsed.data : donorQuerySchema.parse({});
  const [{ rows, total }, counts] = await Promise.all([queryDonors(query), segmentCounts()]);
  const [staff, fallback, payments] = await Promise.all([
    canTodo ? activeStaff() : Promise.resolve([]),
    rows.length && !("latest_gift_cents" in rows[0]) ? lastGiftsFallback(rows.map((d) => d.id as string)) : Promise.resolve<LastGifts>(new Map()),
    loadPayments(rows.map((d) => d.id as string)),
  ]);
  const pages = Math.max(1, Math.ceil(total / DONOR_PAGE_SIZE));
  const link = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...over })) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    return `?${p}`;
  };
  const exportQs = new URLSearchParams(Object.entries(query).filter(([k, v]) => v !== undefined && v !== "" && k !== "page").map(([k, v]) => [k, String(v)]));
  // First click sorts in the column's natural direction (A–Z for names, highest first for numbers and dates); the next click flips it.
  const sortLink = (key: string, first: "asc" | "desc" = "asc") => link({ sort: key, dir: query.sort === key ? (query.dir === "asc" ? "desc" : "asc") : first, page: 1 });
  const ariaSort = (key: string) => (query.sort === key ? (query.dir === "asc" ? "ascending" : "descending") : "none");
  const sortDir = (key: string) => (query.sort === key ? query.dir : null);

  const segments: { key: string; label: string; count: number; icon: LucideIcon; tone: string; href: string; active: boolean }[] = [
    { key: "all", label: "All donors", count: counts.all, icon: Users, tone: "bg-info-bg text-info", href: "/admin/donors", active: noFilters(query) },
    { key: "active", label: "Active donors", count: counts.active, icon: UserCheck, tone: "bg-success-bg text-success", href: "?status=active", active: query.status === "active" && !query.recurring },
    { key: "monthly", label: "Monthly donors", count: counts.monthly, icon: RefreshCw, tone: "bg-brand-50 text-brand-800", href: "?recurring=yes", active: query.recurring === "yes" && !query.status },
    { key: "lapsed", label: "Lapsed donors", count: counts.lapsed, icon: Clock, tone: "bg-warning-bg text-warning", href: "?status=lapsed", active: query.status === "lapsed" },
    { key: "inactive", label: "Inactive / do not contact", count: counts.inactive, icon: PauseCircle, tone: "bg-paper-2 text-ink-soft", href: "?status=inactive", active: query.status === "inactive" || query.status === "do_not_contact" },
  ];

  return (
    <>
      <h1 className="text-3xl font-semibold">Donors</h1>
      {raw.deleted === "1" && <p role="status" className="mt-3 rounded-md bg-success-bg p-3 text-success">The donor and all of their records were permanently deleted.</p>}

      <nav aria-label="Donor segments" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {segments.map(({ key, label, count, icon: Icon, tone, href, active }) => (
          <Link key={key} href={href} aria-current={active ? "true" : undefined}
            className={`rounded-lg bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${active ? "border-2 border-teal-800" : "border border-line"}`}>
            <span aria-hidden="true" className={`inline-flex size-7 items-center justify-center rounded-full ${tone}`}><Icon size={15} /></span>
            <span className="mt-3 block text-sm text-ink-soft">{label}</span>
            <span className="block text-2xl font-bold tabular-nums">{count.toLocaleString("en-US")}</span>
          </Link>
        ))}
      </nav>

      <TodoDialogProvider staff={staff} me={user.id}>
      <section data-panel aria-label="Donor list" className="mt-4 rounded-lg border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-end gap-x-6 border-b border-line px-4 py-1 text-sm font-semibold">
          {query.q && <span className="mr-auto font-normal">Results for <span className="font-semibold">&ldquo;{query.q}&rdquo;</span></span>}
          <Link href="/admin/donors" className="inline-flex min-h-11 items-center text-ink-soft hover:underline">Clear all filters</Link>
          {perms.has("donors.edit") && <Link className={toolLink} href="/admin/donors/duplicates"><Copy aria-hidden="true" size={15} />Find duplicates</Link>}
          {perms.has("donors.export") && <a className={toolLink} href={`/admin/donors/export?${exportQs}`}><FileDown aria-hidden="true" size={15} />Export CSV</a>}
        </div>

        {rows.length === 0 ? <p className="py-12 text-center text-ink-soft">No donors match.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] table-fixed text-left">
              <caption className="sr-only">Donors</caption>
              {/* Fixed, even widths: the name gets extra room for the hover "Create to-do" button; the rest share equally. */}
              <colgroup>
                <col className="w-[3%]" />{/* Status */}
                <col className="w-[3%]" />{/* Score */}
                <col className="w-[18%]" />{/* Donor name */}
                <col className="w-[8%]" />{/* Last gift date */}
                <col className="w-[8%]" />{/* Last gift amount */}
                <col className="w-[8%]" />{/* Total given */}
                <col className="w-[10%]" />{/* Total gifts */}
                <col className="w-[8%]" />{/* Payment type */}
                <col className="w-[3%]" />{/* Expiration */}
                <col className="w-[2%]" />{/* Buffer: empty space after the last column */}
              </colgroup>
              <thead><tr className="border-b border-line text-sm">
                <th scope="col" className={th}>Status</th>
                <th scope="col" aria-sort={ariaSort("score")} className={th}><SortHead href={sortLink("score", "desc")} dir={sortDir("score")}>Score</SortHead></th>
                <th scope="col" aria-sort={ariaSort("name")} className={th}><SortHead href={sortLink("name")} dir={sortDir("name")}>Donor name</SortHead></th>
                <th scope="col" aria-sort={ariaSort("last_gift")} className={th}><SortHead href={sortLink("last_gift", "desc")} dir={sortDir("last_gift")}>Last gift date</SortHead></th>
                <th scope="col" className={th}>Last gift amount</th>
                <th scope="col" aria-sort={ariaSort("lifetime")} className={th}><SortHead href={sortLink("lifetime", "desc")} dir={sortDir("lifetime")}>Total given</SortHead></th>
                <th scope="col" aria-sort={ariaSort("gifts")} className={th}><SortHead href={sortLink("gifts", "desc")} dir={sortDir("gifts")}>Total gifts</SortHead></th>
                <th scope="col" className={th}>Payment type</th>
                <th scope="col" className={th}>Expiration</th>
                <td aria-hidden="true" />
              </tr></thead>
              <tbody>{rows.map((d) => {
                const f = listFigures(d, fallback);
                const name = [d.first_name, d.last_name].filter(Boolean).join(" ");
                const listName = lastFirst(d.first_name as string, d.last_name as string);
                return (
                  <tr key={d.id} className="group border-b border-line last:border-0 hover:bg-paper">
                    <td className={td}><StatusDot status={d.status} /></td>
                    <td className={td}><ScoreBadge score={d.donor_score as number | null | undefined} /></td>
                    <td className={td}>
                      <div className="flex items-center justify-between gap-3">
                        <Link className="text-teal-600 hover:underline" href={`/admin/donors/${d.id}`}>{listName}</Link>
                        {canTodo && <CreateTodoButton donor={{
                          id: d.id, name, status: d.status, phone: d.phone, email: isPlaceholderEmail(d.email) ? "" : d.email,
                          lastGiftCents: f.lastCents, lastGiftAt: f.lastAt, giftCount: f.gifts, lifetimeCents: f.totalCents,
                        }} />}
                      </div>
                    </td>
                    <td className={td + " whitespace-nowrap"}>{f.lastAt ? shortDate(f.lastAt) : ""}</td>
                    <td className={td + " tabular-nums"}>{f.lastCents != null ? formatMoney(f.lastCents) : ""}</td>
                    <td className={td + " tabular-nums"}>{formatMoney(f.totalCents)}</td>
                    <td className={td + " tabular-nums"}>{f.gifts}</td>
                    <td className={td + " whitespace-nowrap"}>{(() => { const pm = payments.get(d.id as string); return pm ? (pm.last4 ? `${pm.type} •••• ${pm.last4}` : pm.type) : ""; })()}</td>
                    <td className={td + " tabular-nums"}>{payments.get(d.id as string)?.expires ?? ""}</td>
                    <td aria-hidden="true" />
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-1 text-sm text-ink-soft">
          <span role="status">{total.toLocaleString("en-US")} donor{total === 1 ? "" : "s"}</span>
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center gap-4">
              {query.page > 1 && <Link className="inline-flex min-h-11 items-center font-semibold text-teal-600 hover:underline" href={link({ page: query.page - 1 })}>Previous</Link>}
              <span>Page {query.page} of {pages}</span>
              {query.page < pages && <Link className="inline-flex min-h-11 items-center font-semibold text-teal-600 hover:underline" href={link({ page: query.page + 1 })}>Next</Link>}
            </nav>
          )}
        </div>
      </section>
      </TodoDialogProvider>
    </>
  );
}
