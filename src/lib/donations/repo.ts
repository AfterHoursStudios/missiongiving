import type { DonationStatus } from "./status";

export interface DonationRow {
  id: string;
  donor_id: string;
  recurring_id: string | null;
  amount_cents: number;
  refunded_cents: number;
  payment_method: "card" | "us_bank_account" | "offline";
  status: DonationStatus;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
}

export interface RecurringRow {
  id: string;
  donor_id: string;
  fund_id: string | null;
  project_id: string | null;
  tier_id: string | null;
  amount_cents: number;
  frequency: "monthly" | "yearly";
  status: string;
  stripe_subscription_id: string | null;
}

export type EventClaim = "new" | "retry" | "done";

/** Persistence boundary for webhook processing. Supabase implementation in repo.supabase.ts; in-memory for tests. */
export interface DonationsRepo {
  claimEvent(id: string, type: string): Promise<EventClaim>;
  finishEvent(id: string, status: "processed" | "failed" | "ignored", error?: string): Promise<void>;

  findDonationByPaymentIntent(pi: string): Promise<DonationRow | null>;
  findDonationByInvoice(invoice: string): Promise<DonationRow | null>;
  updateDonation(id: string, patch: Partial<Omit<DonationRow, "id" | "donor_id">> & {
    settled_at?: string | null; fee_cents?: number; stripe_charge_id?: string | null; payment_method?: string;
  }): Promise<void>;
  createDonationFromInvoice(row: {
    recurring: RecurringRow; invoice: string; paymentIntent: string | null; amount_cents: number;
    status: DonationStatus; paymentMethod: "card" | "us_bank_account"; settled: boolean;
  }): Promise<DonationRow>;

  findRecurringBySubscription(sub: string): Promise<RecurringRow | null>;
  updateRecurring(id: string, patch: { status?: string; next_charge_at?: string | null; canceled_at?: string | null }): Promise<void>;

  ensureReceipt(donationId: string, final: boolean): Promise<{ receipt_number: string; is_final: boolean }>;
  upsertDispute(row: { donationId: string; stripeDisputeId: string; amount_cents: number; status: string; reason: string | null }): Promise<void>;
}
