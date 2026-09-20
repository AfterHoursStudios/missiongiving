import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { processWebhook, type HandlerDeps } from "@/lib/stripe/handlers";
import type { DonationRow, DonationsRepo, RecurringRow } from "@/lib/donations/repo";

function memoryRepo() {
  const events = new Map<string, string>();
  const donations = new Map<string, DonationRow>();
  const recurring = new Map<string, RecurringRow>();
  const receipts = new Map<string, { receipt_number: string; is_final: boolean }>();
  const disputes: unknown[] = [];
  let n = 0;
  const repo: DonationsRepo = {
    async claimEvent(id) {
      const s = events.get(id);
      if (s === "processed" || s === "ignored") return "done";
      events.set(id, "received");
      return s ? "retry" : "new";
    },
    async finishEvent(id, status) { events.set(id, status); },
    async findDonationByPaymentIntent(pi) { return [...donations.values()].find((d) => d.stripe_payment_intent_id === pi) ?? null; },
    async findDonationByInvoice(inv) { return [...donations.values()].find((d) => d.stripe_invoice_id === inv) ?? null; },
    async updateDonation(id, patch) { donations.set(id, { ...donations.get(id)!, ...patch } as DonationRow); },
    async createDonationFromInvoice(r) {
      const d: DonationRow = {
        id: `d${++n}`, donor_id: "donor1", recurring_id: r.recurring.id, amount_cents: r.amount_cents, refunded_cents: 0,
        payment_method: r.paymentMethod, status: r.status, stripe_payment_intent_id: r.paymentIntent, stripe_invoice_id: r.invoice,
      };
      donations.set(d.id, d);
      return d;
    },
    async findRecurringBySubscription(sub) { return [...recurring.values()].find((r) => r.stripe_subscription_id === sub) ?? null; },
    async updateRecurring(id, patch) { recurring.set(id, { ...recurring.get(id)!, ...patch } as RecurringRow); },
    async ensureReceipt(id, final) {
      const cur = receipts.get(id);
      const r = { receipt_number: cur?.receipt_number ?? `MG-${1000 + receipts.size}`, is_final: final || !!cur?.is_final };
      receipts.set(id, r);
      return r;
    },
    async upsertDispute(row) { disputes.push(row); },
  };
  return { repo, events, donations, recurring, receipts, disputes };
}

const evt = (id: string, type: string, object: unknown) => ({ id, type, data: { object } }) as unknown as Stripe.Event;

let mem: ReturnType<typeof memoryRepo>;
let notify: ReturnType<typeof vi.fn<HandlerDeps["notify"]>>;
let deps: HandlerDeps;

function seedDonation(over: Partial<DonationRow> = {}) {
  const d: DonationRow = {
    id: "d0", donor_id: "donor1", recurring_id: null, amount_cents: 5000, refunded_cents: 0,
    payment_method: "us_bank_account", status: "pending", stripe_payment_intent_id: "pi_1", stripe_invoice_id: null, ...over,
  };
  mem.donations.set(d.id, d);
  return d;
}

beforeEach(() => {
  mem = memoryRepo();
  notify = vi.fn<HandlerDeps["notify"]>().mockResolvedValue(undefined);
  deps = {
    repo: mem.repo, notify,
    lookupInvoicePayment: async () => ({ paymentIntent: "pi_inv", method: "card" }),
    lookupChargeFee: async () => 175,
  };
});

describe("webhook idempotency", () => {
  it("processes a redelivered event exactly once", async () => {
    seedDonation({ payment_method: "card" });
    const e = evt("evt_1", "payment_intent.succeeded", { id: "pi_1", latest_charge: "ch_1" });
    expect(await processWebhook(e, deps)).toBe("processed");
    expect(await processWebhook(e, deps)).toBe("duplicate");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(mem.donations.get("d0")).toMatchObject({ status: "succeeded", fee_cents: 175 });
    expect(mem.receipts.get("d0")?.is_final).toBe(true);
  });

  it("retries a previously failed event and does not double-notify", async () => {
    seedDonation({ payment_method: "card" });
    const boom = vi.spyOn(mem.repo, "updateDonation").mockRejectedValueOnce(new Error("db down"));
    const e = evt("evt_2", "payment_intent.succeeded", { id: "pi_1", latest_charge: "ch_1" });
    await expect(processWebhook(e, deps)).rejects.toThrow("db down");
    expect(mem.events.get("evt_2")).toBe("failed");
    boom.mockRestore();
    expect(await processWebhook(e, deps)).toBe("processed");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not let out-of-order or duplicate-type events regress state", async () => {
    seedDonation({ payment_method: "card" });
    await processWebhook(evt("e1", "payment_intent.succeeded", { id: "pi_1" }), deps);
    await processWebhook(evt("e2", "payment_intent.processing", { id: "pi_1" }), deps);
    await processWebhook(evt("e3", "payment_intent.payment_failed", { id: "pi_1" }), deps);
    expect(mem.donations.get("d0")!.status).toBe("succeeded");
  });

  it("ignores unknown events and unknown payment intents", async () => {
    expect(await processWebhook(evt("e9", "customer.created", {}), deps)).toBe("ignored");
    expect(await processWebhook(evt("e10", "payment_intent.succeeded", { id: "pi_nope" }), deps)).toBe("ignored");
  });
});

describe("ACH states", () => {
  it("stays pending with only a non-final receipt until settlement", async () => {
    seedDonation();
    await processWebhook(evt("e1", "payment_intent.processing", { id: "pi_1" }), deps);
    expect(mem.donations.get("d0")!.status).toBe("processing");
    expect(mem.receipts.get("d0")!.is_final).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("finalizes and sends the ACH-confirmed email on settlement", async () => {
    seedDonation();
    await processWebhook(evt("e1", "payment_intent.processing", { id: "pi_1" }), deps);
    await processWebhook(evt("e2", "payment_intent.succeeded", { id: "pi_1", latest_charge: "ch_1" }), deps);
    expect(mem.donations.get("d0")!.status).toBe("succeeded");
    expect(mem.receipts.get("d0")!.is_final).toBe(true);
    expect(notify).toHaveBeenCalledWith("ach_confirmed", { donationId: "d0" });
  });

  it("handles a delayed ACH failure after processing, without a final receipt", async () => {
    seedDonation();
    await processWebhook(evt("e1", "payment_intent.processing", { id: "pi_1" }), deps);
    await processWebhook(evt("e2", "payment_intent.payment_failed", { id: "pi_1" }), deps);
    expect(mem.donations.get("d0")!.status).toBe("failed");
    expect(mem.receipts.get("d0")!.is_final).toBe(false);
    expect(notify).toHaveBeenCalledWith("payment_failed", { donationId: "d0" });
  });
});

describe("refunds and disputes", () => {
  it("applies partial then full refunds, ignoring stale events", async () => {
    seedDonation({ status: "succeeded", payment_method: "card" });
    await processWebhook(evt("r1", "charge.refunded", { payment_intent: "pi_1", amount_refunded: 1500 }), deps);
    expect(mem.donations.get("d0")).toMatchObject({ status: "partially_refunded", refunded_cents: 1500 });
    await processWebhook(evt("r0", "charge.refunded", { payment_intent: "pi_1", amount_refunded: 500 }), deps); // stale
    expect(mem.donations.get("d0")!.refunded_cents).toBe(1500);
    await processWebhook(evt("r2", "charge.refunded", { payment_intent: "pi_1", amount_refunded: 5000 }), deps);
    expect(mem.donations.get("d0")).toMatchObject({ status: "refunded", refunded_cents: 5000 });
  });

  it("marks disputed, and restores status when won", async () => {
    seedDonation({ status: "succeeded", payment_method: "card" });
    const dispute = { id: "dp_1", payment_intent: "pi_1", amount: 5000, reason: "fraudulent" };
    await processWebhook(evt("d1", "charge.dispute.created", { ...dispute, status: "needs_response" }), deps);
    expect(mem.donations.get("d0")!.status).toBe("disputed");
    await processWebhook(evt("d2", "charge.dispute.closed", { ...dispute, status: "won" }), deps);
    expect(mem.donations.get("d0")!.status).toBe("succeeded");
  });
});

describe("subscriptions", () => {
  const rec: RecurringRow = {
    id: "r1", donor_id: "donor1", fund_id: null, project_id: null, tier_id: null,
    amount_cents: 2500, frequency: "monthly", status: "incomplete", stripe_subscription_id: "sub_1",
  };
  const invoice = (over = {}) => ({
    id: "in_1", amount_paid: 2500, amount_due: 2500,
    parent: { subscription_details: { subscription: "sub_1" } }, ...over,
  });

  it("activates on first paid invoice and creates a renewal donation per invoice", async () => {
    mem.recurring.set("r1", { ...rec });
    await processWebhook(evt("i1", "invoice.paid", invoice()), deps);
    expect(mem.recurring.get("r1")!.status).toBe("active");
    await processWebhook(evt("i2", "invoice.paid", invoice({ id: "in_2" })), deps);
    const rows = [...mem.donations.values()];
    expect(rows).toHaveLength(2);
    expect(rows.every((d) => d.status === "succeeded" && d.recurring_id === "r1")).toBe(true);
    expect(new Set(rows.map((d) => d.stripe_invoice_id)).size).toBe(2);
  });

  it("marks past_due on failed renewal and records the failed attempt", async () => {
    mem.recurring.set("r1", { ...rec, status: "active" });
    await processWebhook(evt("f1", "invoice.payment_failed", invoice()), deps);
    expect(mem.recurring.get("r1")!.status).toBe("past_due");
    expect([...mem.donations.values()][0].status).toBe("failed");
  });

  it("cancels once, preserving history, and does not resurrect from a stale update", async () => {
    mem.recurring.set("r1", { ...rec, status: "active" });
    await processWebhook(evt("c1", "customer.subscription.deleted", { id: "sub_1" }), deps);
    await processWebhook(evt("c2", "customer.subscription.updated", { id: "sub_1", status: "active", items: { data: [{ current_period_end: 2000000000 }] } }), deps);
    expect(mem.recurring.get("r1")!.status).toBe("canceled");
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
