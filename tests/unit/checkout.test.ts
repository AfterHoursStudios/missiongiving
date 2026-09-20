import { describe, expect, it } from "vitest";
import { resolveAmount, type Limits, type TierRow } from "@/lib/donations/checkout";
import { fillTemplate, pickConfirmationMessage, renderDonationMessage } from "@/lib/messages";
import { advanceStatus, isReceiptFinal } from "@/lib/donations/status";

const limits: Limits = { min: 500, max: 100000, customEnabled: true, projectAllowsCustom: true };
const tier = (over: Partial<TierRow> = {}): TierRow => ({
  id: "t1", amount_cents: 2500, status: "active", project_id: null, general_fund: true,
  allow_one_time: true, allow_monthly: true, allow_yearly: false, active_from: null, active_until: null, ...over,
});
const base = { frequency: "monthly" as const, customAmountCents: null, destination: { kind: "general" as const } };

describe("resolveAmount", () => {
  it("uses the tier's stored amount, ignoring any client-supplied custom amount", () => {
    const r = resolveAmount({ ...base, tierId: "t1", customAmountCents: 1 }, tier(), limits);
    expect(r).toEqual({ ok: true, amountCents: 2500, tierId: "t1" });
  });
  it("rejects inactive, expired, not-yet-active and wrong-frequency tiers", () => {
    const now = new Date("2026-06-01");
    expect(resolveAmount({ ...base, tierId: "t1" }, tier({ status: "inactive" }), limits, now).ok).toBe(false);
    expect(resolveAmount({ ...base, tierId: "t1" }, tier({ active_until: "2026-01-01" }), limits, now).ok).toBe(false);
    expect(resolveAmount({ ...base, tierId: "t1" }, tier({ active_from: "2027-01-01" }), limits, now).ok).toBe(false);
    expect(resolveAmount({ ...base, tierId: "t1", frequency: "yearly" }, tier(), limits, now).ok).toBe(false);
  });
  it("rejects a tier id that does not match the loaded tier", () => {
    expect(resolveAmount({ ...base, tierId: "other" }, tier(), limits).ok).toBe(false);
    expect(resolveAmount({ ...base, tierId: "t1" }, null, limits).ok).toBe(false);
  });
  it("keeps project-specific tiers off other destinations", () => {
    const projectTier = tier({ project_id: "p1", general_fund: false });
    expect(resolveAmount({ ...base, tierId: "t1" }, projectTier, limits).ok).toBe(false);
    expect(resolveAmount({ ...base, tierId: "t1", destination: { kind: "project", projectId: "p2" } }, projectTier, limits).ok).toBe(false);
    expect(resolveAmount({ ...base, tierId: "t1", destination: { kind: "project", projectId: "p1" } }, projectTier, limits).ok).toBe(true);
  });
  it("enforces custom-amount setting and limits", () => {
    const c = (cents: number | null, l = limits) => resolveAmount({ ...base, tierId: null, customAmountCents: cents }, null, l);
    expect(c(1234)).toEqual({ ok: true, amountCents: 1234, tierId: null });
    expect(c(100).ok).toBe(false);
    expect(c(200000).ok).toBe(false);
    expect(c(null).ok).toBe(false);
    expect(c(1234, { ...limits, customEnabled: false }).ok).toBe(false);
    expect(c(1234, { ...limits, projectAllowsCustom: false }).ok).toBe(false);
  });
});

describe("tier-specific messages", () => {
  const template = { subject: "Thanks {{donor_first_name}}", body_html: "<p>General for {{donation_amount}}</p>", body_text: "General for {{donation_amount}}" };
  const vars = { donor_first_name: "Ada", donation_amount: "$25.00" };

  it("uses the general template when the tier has no message", () => {
    const m = renderDonationMessage(template, "  ", vars);
    expect(m.usedTierOverride).toBe(false);
    expect(m.html).toBe("<p>General for $25.00</p>");
  });
  it("tier message overrides the general body but keeps the template subject", () => {
    const m = renderDonationMessage(template, "Your {{donation_amount}} gift matters, {{donor_first_name}}.", vars);
    expect(m.usedTierOverride).toBe(true);
    expect(m.subject).toBe("Thanks Ada");
    expect(m.html).toContain("Your $25.00 gift matters, Ada.");
    expect(m.html).not.toContain("General");
  });
  it("confirmation page prefers the tier message", () => {
    expect(pickConfirmationMessage("Tier msg", "Default")).toBe("Tier msg");
    expect(pickConfirmationMessage("", "Default")).toBe("Default");
    expect(pickConfirmationMessage(null, "Default")).toBe("Default");
  });
});

describe("template safety", () => {
  it("escapes values and drops unknown variables", () => {
    expect(fillTemplate("Hi {{donor_first_name}} {{secret}}", { donor_first_name: "<script>x</script>" })).toBe("Hi &lt;script&gt;x&lt;/script&gt; ");
  });
  it("sanitizes dangerous markup in templates", () => {
    const m = renderDonationMessage(
      { subject: "s", body_html: '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a>', body_text: "" },
      null, {},
    );
    expect(m.html).not.toMatch(/script|onclick|javascript:/i);
  });
});

describe("status transitions", () => {
  it("only moves forward, except failed -> retry success", () => {
    expect(advanceStatus("succeeded", "processing")).toBe("succeeded");
    expect(advanceStatus("pending", "processing")).toBe("processing");
    expect(advanceStatus("processing", "failed")).toBe("failed");
    expect(advanceStatus("failed", "succeeded")).toBe("succeeded");
    expect(advanceStatus("refunded", "succeeded")).toBe("refunded");
  });
  it("issues final receipts only for settled money", () => {
    expect(isReceiptFinal("succeeded")).toBe(true);
    for (const s of ["pending", "processing", "failed", "canceled"] as const) expect(isReceiptFinal(s)).toBe(false);
  });
});
