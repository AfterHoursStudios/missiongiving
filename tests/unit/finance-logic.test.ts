import { describe, expect, it } from "vitest";
import { offlineGiftSchema, refundSchema, validateRefund } from "@/lib/admin/finance-logic";
import { classifyAttention, type ReconDonation, type ReconEvent, type ReconRecurring } from "@/lib/admin/reconcile";

describe("offlineGiftSchema", () => {
  const ok = { email: " Donor@Example.com ", amount: "250", date: "2026-01-15", method: "check" };
  it("normalizes and converts", () => {
    expect(offlineGiftSchema.parse(ok)).toMatchObject({ email: "donor@example.com", amount: 25000, project_id: null, send_receipt: false });
  });
  it("rejects bad amounts, future dates and unknown methods", () => {
    expect(offlineGiftSchema.safeParse({ ...ok, amount: "0" }).success).toBe(false);
    expect(offlineGiftSchema.safeParse({ ...ok, date: "2999-01-01" }).success).toBe(false);
    expect(offlineGiftSchema.safeParse({ ...ok, method: "bitcoin" }).success).toBe(false);
    expect(offlineGiftSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
  });
});

describe("refunds", () => {
  const base = { status: "succeeded", payment_method: "card", amount_cents: 5000, refunded_cents: 0, has_payment_intent: true };
  it("allows full and partial refunds up to the remaining balance", () => {
    expect(validateRefund(base, 5000)).toBeNull();
    expect(validateRefund({ ...base, status: "partially_refunded", refunded_cents: 2000 }, 3000)).toBeNull();
  });
  it("blocks over-refunds, unsettled, offline and already-refunded gifts", () => {
    expect(validateRefund(base, 5001)).toMatch(/most that can still/);
    expect(validateRefund({ ...base, refunded_cents: 1000, status: "partially_refunded" }, 4001)).toMatch(/40\.00/);
    for (const status of ["pending", "processing", "failed", "disputed", "canceled"]) expect(validateRefund({ ...base, status }, 100), status).toMatch(/settled/);
    expect(validateRefund({ ...base, payment_method: "offline" }, 100)).toMatch(/Offline/);
    expect(validateRefund({ ...base, has_payment_intent: false }, 100)).toMatch(/Stripe/);
    expect(validateRefund({ ...base, status: "refunded", refunded_cents: 5000 }, 100)).toMatch(/settled|already/);
  });
  it("parses the refund form", () => {
    const id = "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d";
    expect(refundSchema.parse({ donationId: id, amount: "12.34", reason: "Donor request" }).amount).toBe(1234);
    expect(refundSchema.safeParse({ donationId: id, amount: "12.34", reason: "" }).success).toBe(false);
  });
});

describe("classifyAttention", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const don = (o: Partial<ReconDonation>): ReconDonation => ({
    id: "d" + Math.random(), donor_id: "a", donor_name: "Sample Donor", amount_cents: 5000, refunded_cents: 0, status: "succeeded", payment_method: "card",
    frequency: "one_time", donated_at: "2026-06-01T00:00:00Z", settled_at: "2026-06-01T00:00:00Z", has_final_receipt: true, ...o,
  });
  const ids = (g: ReturnType<typeof classifyAttention>) => g.map((x) => x.id);

  it("reports nothing for a healthy ledger", () => expect(classifyAttention([don({})], [], [], now)).toEqual([]));
  it("flags pending payments only beyond their normal window", () => {
    const g = classifyAttention([
      don({ status: "pending", payment_method: "card", donated_at: "2026-06-15T11:30:00Z" }),                        // 30 min: fine
      don({ status: "pending", payment_method: "card", donated_at: "2026-06-15T09:00:00Z" }),                        // 3 h: stuck
      don({ status: "processing", payment_method: "us_bank_account", donated_at: "2026-06-12T00:00:00Z" }),          // 3 days ACH: normal
      don({ status: "processing", payment_method: "us_bank_account", donated_at: "2026-06-01T00:00:00Z" }),          // 14 days ACH: stuck
    ], [], [], now);
    expect(g.find((x) => x.id === "stuck")!.items).toHaveLength(2);
  });
  it("flags disputes, missing final receipts and refund inconsistencies", () => {
    const g = classifyAttention([
      don({ status: "disputed" }), don({ has_final_receipt: false }),
      don({ status: "succeeded", refunded_cents: 100 }), don({ status: "refunded", refunded_cents: 100 }), don({ status: "partially_refunded", refunded_cents: 5000 }),
      don({ status: "partially_refunded", refunded_cents: 2000 }),                                                    // consistent
    ], [], [], now);
    expect(ids(g)).toEqual(["disputed", "no-receipt", "refund-mismatch"]);
    expect(g.find((x) => x.id === "refund-mismatch")!.items).toHaveLength(3);
  });
  it("flags recurring problems and stalled or failed webhooks", () => {
    const rec: ReconRecurring[] = [
      { id: "r1", donor_id: "a", donor_name: "A", status: "incomplete", amount_cents: 2500, created_at: "2026-06-10T00:00:00Z" },
      { id: "r2", donor_id: "a", donor_name: "A", status: "incomplete", amount_cents: 2500, created_at: "2026-06-15T10:00:00Z" },
      { id: "r3", donor_id: "a", donor_name: "A", status: "past_due", amount_cents: 2500, created_at: "2026-01-01T00:00:00Z" },
    ];
    const ev: ReconEvent[] = [
      { stripe_event_id: "e1", type: "invoice.paid", status: "failed", attempts: 3, error: "Error: db down", received_at: "2026-06-15T11:00:00Z" },
      { stripe_event_id: "e2", type: "charge.refunded", status: "received", attempts: 1, error: null, received_at: "2026-06-15T11:00:00Z" },
      { stripe_event_id: "e3", type: "charge.refunded", status: "received", attempts: 1, error: null, received_at: "2026-06-15T11:59:00Z" },
      { stripe_event_id: "e4", type: "charge.refunded", status: "processed", attempts: 1, error: null, received_at: "2026-06-01T00:00:00Z" },
    ];
    const g = classifyAttention([], rec, ev, now);
    expect(g.find((x) => x.id === "recurring-incomplete")!.items.map((i) => i.key)).toEqual(["r1"]);
    expect(g.find((x) => x.id === "recurring-past-due")!.items).toHaveLength(1);
    expect(g.find((x) => x.id === "webhooks")!.items.map((i) => i.eventId)).toEqual(["e1", "e2"]);
  });
});
