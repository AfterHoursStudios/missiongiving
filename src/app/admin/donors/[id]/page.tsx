import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatMoney, netSettledCents } from "@/lib/money";
import { givingProfile } from "@/lib/admin/giving-profile";
import { listPaymentMethods } from "@/lib/admin/payment-on-file";
import { finalizePaymentMethodSetup } from "@/lib/admin/payment-method-actions";
import { publicEnv } from "@/lib/env";
import { DonorHeader, RecordTabs, TabToolbar, type RecordTab } from "@/components/admin/donor-record/header";
import { MainTab } from "@/components/admin/donor-record/main-tab";
import { GiftsTab, type GiftRow } from "@/components/admin/donor-record/gifts-tab";
import { PledgesTab, type PledgeRow } from "@/components/admin/donor-record/pledges-tab";
import { ContactsTab, buildContacts, type CampaignRow, type CommRow } from "@/components/admin/donor-record/contacts-tab";
import { AccountsTab } from "@/components/admin/donor-record/accounts-tab";
import { linkCls } from "@/components/admin/donor-record/ui";
import { TodoDialogProvider } from "@/components/admin/todo-dialog";
import type { TodoRow } from "@/components/admin/todo-list";
import { getOrgSettings } from "@/lib/settings";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";
import { scoreTier } from "@/lib/admin/donor-score";
import { reconcileDonorInFlight } from "@/lib/stripe/reconcile-donation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donor" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>) => (Array.isArray(v) ? v[0] : v) ?? null;

const TAB_KEYS = ["main", "gifts", "pledges", "contacts", "accounts"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export default async function DonorDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; page?: string; failed?: string; setup_intent?: string }>;
}) {
  const { user, perms } = await requirePermission("donors.view");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const sp = await searchParams;
  const db = createSupabaseAdminClient();
  const { data: donor } = await db.from("donor_profiles").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!donor) notFound();

  const canEdit = perms.has("donors.edit");
  const canFinance = perms.has("finance.view");
  const canChangePayment = canFinance && perms.has("expenses.record");
  const canMessage = perms.has("comms.send");
  const visible = TAB_KEYS.filter((k) => k !== "accounts" || canFinance);
  const tab: TabKey = (visible as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as TabKey) : "main";
  const page = Math.max(1, Number(sp.page) || 1);

  // Returning from confirming a new card/bank account with Stripe (see PaymentMethodForm): make it the default.
  const setupResult = sp.setup_intent && canFinance ? await finalizePaymentMethodSetup(id, sp.setup_intent) : null;

  // Bring this donor's recent in-flight gifts up to date from Stripe before showing them (covers missed webhooks).
  await reconcileDonorInFlight(id);

  const [donations, recurring, assigned, comms, campaigns, scoreRow] = await Promise.all([
    db.from("donations").select("id, amount_cents, refunded_cents, status, stripe_payment_intent_id, frequency, payment_method, donated_at, recurring_id, is_offline, projects(title, kind), receipts(receipt_number, is_final, delivery_history)").eq("donor_id", id).order("donated_at", { ascending: false }),
    db.from("recurring_donations").select("id, amount_cents, frequency, status, created_at, next_charge_at, canceled_at, cancel_reason, projects(title, kind)").eq("donor_id", id),
    db.from("donor_tag_assignments").select("donor_tags(id, name)").eq("donor_id", id),
    db.from("donor_communications").select("id, kind, channel, subject, detail, status, created_at, created_by").eq("donor_id", id).order("created_at", { ascending: false }).limit(1000),
    db.from("campaign_recipients").select("id, status, updated_at, communication_campaigns(subject, kind, sent_at)").eq("donor_id", id).limit(1000),
    db.from("donor_scores").select("donor_score, recency_score, frequency_score, monetary_score, gifts_24m, given_24m_cents").eq("donor_id", id).maybeSingle(),
  ]);
  const score = scoreRow.error ? null : scoreRow.data; // null until migration 0018 is applied
  const tier = scoreTier(score?.donor_score);

  const gifts: GiftRow[] = (donations.data ?? []).map((g) => ({
    ...g, project: one<{ title: string }>(g.projects)?.title ?? null,
    receipt: one<{ receipt_number: string; is_final: boolean; delivery_history: unknown[] }>(g.receipts),
  }));
  const pledges: PledgeRow[] = (recurring.data ?? []).map((r) => ({ ...r, project: one<{ title: string }>(r.projects)?.title ?? null }));
  const tags = (assigned.data ?? []).map((a) => one<{ id: string; name: string }>(a.donor_tags)).filter(Boolean) as { id: string; name: string }[];

  // Staff emails for contacts they logged by hand.
  const staffIds = [...new Set((comms.data ?? []).map((c) => c.created_by).filter(Boolean))] as string[];
  const staff = staffIds.length ? new Map(((await db.from("profiles").select("id, email").in("id", staffIds)).data ?? []).map((p) => [p.id, p.email as string])) : new Map<string, string>();
  const contacts = buildContacts(
    (comms.data ?? []).map((c): CommRow => ({ ...c, staff: c.created_by ? staff.get(c.created_by) ?? null : null })),
    (campaigns.data ?? []).map((r): CampaignRow => ({ id: r.id, status: r.status, updated_at: r.updated_at, campaign: one<{ subject: string; kind: string; sent_at: string | null }>(r.communication_campaigns) })),
  );

  // Header: automatic flags and headline stats.
  const livePledges = pledges.filter((r) => ["active", "past_due"].includes(r.status));
  const isSponsor = [...(donations.data ?? []).map((g) => one<{ kind: string }>(g.projects)), ...(recurring.data ?? []).map((r) => one<{ kind: string }>(r.projects))].some((p) => p?.kind === "sponsorship");
  const profile = givingProfile(gifts);
  const monthlyCents = livePledges.reduce((s, r) => s + (r.frequency === "yearly" ? Math.round(r.amount_cents / 12) : r.amount_cents), 0);
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const tabs: RecordTab[] = [
    { key: "main", label: "Main", subtitle: "profile info" },
    { key: "gifts", label: "Gifts", subtitle: "donations", count: gifts.length },
    { key: "pledges", label: "Pledges", subtitle: "recurring gifts", count: pledges.length },
    { key: "contacts", label: "Contacts", subtitle: "communications sent", count: contacts.length },
    { key: "accounts", label: "Accounts", subtitle: "payment methods", count: donor.stripe_customer_id ? 1 : 0 },
  ].filter((t) => (visible as readonly string[]).includes(t.key));
  const tabHref = (k: string) => `/admin/donors/${id}?tab=${k}`;

  // Contacts-tab-only data: to-dos (null when migration 0014 isn't applied) and the staff who can be assigned.
  const contactsData = tab === "contacts" ? await (async () => {
    const [todosRes, staffRes, settings] = await Promise.all([
      db.from("donor_todos").select("id, donor_id, activity, due_date, due_time, notes, completed_at, assigned_to").eq("donor_id", id).limit(500),
      db.from("staff_profiles").select("user_id, display_name, active").order("display_name"),
      getOrgSettings(),
    ]);
    const names = new Map((staffRes.data ?? []).map((s) => [s.user_id as string, s.display_name as string]));
    const todos: TodoRow[] | null = todosRes.error ? null : (todosRes.data ?? []).map((t) => ({ ...t, assignee: names.get(t.assigned_to) ?? null }));
    return {
      todos, staff: (staffRes.data ?? []).filter((s) => s.active).map((s) => ({ id: s.user_id as string, name: s.display_name as string })),
      today: new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone }),
    };
  })() : null;

  // Main-tab-only data, loaded only when that tab is open.
  const main = tab === "main" ? await Promise.all([
    canMessage ? db.from("message_templates").select("key, name").order("name") : Promise.resolve({ data: null }),
    db.from("donor_tags").select("id, name").order("name"),
    db.from("donor_notes").select("id, body, created_at").eq("donor_id", id).order("created_at", { ascending: false }),
    db.from("communication_preferences").select("marketing_email, project_updates, annual_statement_email, suppressed").eq("donor_id", id).maybeSingle(),
  ]) : null;

  return (
    <>
      <p className="mb-3 text-sm"><Link className={`${linkCls} inline-flex min-h-11 items-center gap-1`} href="/admin/donors"><ChevronLeft aria-hidden="true" size={16} />All donors</Link></p>

      <DonorHeader
        donor={donor}
        flags={[
          { label: "Monthly Donor", on: livePledges.length > 0, icon: "monthly" },
          { label: "Sponsor", on: isSponsor, icon: "sponsor" },
          ...tags.map((t) => ({ label: t.name, on: true, icon: "tag" as const })),
        ]}
        stats={[
          ...(score && tier ? [{
            icon: "score" as const, label: "Donor score",
            value: <>{score.donor_score}<span className="text-base font-normal text-ink-soft">/100</span></>,
            hint: <span className={`inline-block rounded border-2 px-1.5 text-xs font-bold uppercase ${TIER_TONE[tier]}`}>{tier}</span>,
          }] : []),
          { icon: "lastGift", label: "Last gift", value: profile.last ? formatMoney(profile.last.cents) : "—", hint: profile.last ? shortDate(profile.last.at) : undefined },
          { icon: "totalGifts", label: "Total gifts", value: String(profile.giftCount) },
          { icon: "totalGiven", label: "Total given", value: formatMoney(netSettledCents(gifts)) },
          ...(livePledges.length ? [{ icon: "monthly" as const, label: "Recurring giving", value: `${formatMoney(monthlyCents)}/mo`, hint: `${livePledges.length} active` }] : []),
        ]}
      />

      <RecordTabs tabs={tabs} active={tab} href={tabHref} />

      {main && (
        <MainTab
          donor={donor} canEdit={canEdit} canGift={canFinance} canAudit={perms.has("audit.view")} score={score}
          deletion={perms.has("donors.delete") ? { gifts: gifts.length, pledges: pledges.length, activePledges: livePledges.length, hasLogin: !!donor.user_id } : null}
          templates={canMessage ? main[0].data ?? [] : null} tags={tags} allTags={main[1].data ?? []}
          notes={main[2].data ?? []} prefs={main[3].data} profile={profile}
          lastContact={contacts[0] ? { at: contacts[0].at, type: contacts[0].activity } : null}
        />
      )}

      {/* Gifts: no toolbar (gifts are added with the list's "+ Add gift" button), just the strip that closes the tab bar. */}
      {tab === "gifts" && <div aria-hidden="true" className="h-3 rounded-b-lg border border-t-0 border-line bg-white shadow-sm" />}
      {tab !== "main" && tab !== "gifts" && (
        <TabToolbar>
          <span className="text-ink-soft">{TOOLBAR_NOTE[tab]}</span>
        </TabToolbar>
      )}

      {tab === "gifts" && <GiftsTab donorId={id} gifts={gifts} page={page} showFailed={sp.failed === "1"} canEdit={canEdit} canRefund={perms.has("refunds.issue")} canGift={canFinance} />}
      {tab === "pledges" && <PledgesTab donorId={id} pledges={pledges} gifts={gifts} page={page} canGift={canFinance} />}
      {contactsData && (
        <TodoDialogProvider staff={contactsData.staff} me={user.id}>
          <ContactsTab donorId={id} contacts={contacts} page={page} canEdit={canEdit} logReady={!comms.error}
            todos={contactsData.todos} today={contactsData.today}
            todoDonor={{ id, name: `${donor.first_name} ${donor.last_name}`, status: donor.status, phone: donor.phone, email: isPlaceholderEmail(donor.email) ? "" : donor.email,
              lastGiftCents: profile.last?.cents ?? null, lastGiftAt: profile.last?.at ?? null, giftCount: profile.giftCount, lifetimeCents: profile.lifetimeCents }} />
        </TodoDialogProvider>
      )}
      {tab === "accounts" && canFinance && (
        <AccountsTab donorId={id} {...await listPaymentMethods(donor.stripe_customer_id)} canChange={canChangePayment}
          publishableKey={publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null} setupResult={setupResult} />
      )}
    </>
  );
}

const TIER_TONE = { high: "border-success text-success", medium: "border-gold-dark text-gold-dark", low: "border-danger text-danger" } as const;

const TOOLBAR_NOTE: Record<Exclude<TabKey, "main" | "gifts">, string> = {
  pledges: "Recurring gifts this donor has signed up for.",
  contacts: "To-dos for this donor, then every receipt, thank-you, message, campaign and logged contact sent to them.",
  accounts: "Saved cards and bank accounts, read live from Stripe.",
};
