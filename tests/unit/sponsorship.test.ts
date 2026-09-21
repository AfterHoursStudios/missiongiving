import { describe, expect, it } from "vitest";
import { sponsorshipSchema, sponsorshipToRow, sponsorshipSlug } from "@/lib/admin/sponsorship-schema";
import { checkoutSchema, resolveSponsorship } from "@/lib/donations/checkout";

const ok = { name: "Asha", country: "India", amount: "80", status: "active" };

describe("sponsorshipSchema", () => {
  it("converts the monthly amount to cents and defaults optional fields", () => {
    expect(sponsorshipToRow(sponsorshipSchema.parse(ok))).toMatchObject({ name: "Asha", country: "India", monthly_amount_cents: 8000, description: null, display_order: 0 });
  });
  it("rejects bad names, amounts and statuses", () => {
    for (const bad of [{ name: " " }, { amount: "4" }, { amount: "1001" }, { amount: "abc" }, { status: "deleted" }])
      expect(sponsorshipSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });
  it("ignores fields a client should not set", () => {
    const row = sponsorshipToRow(sponsorshipSchema.parse({ ...ok, id: "x", project_id: "y", photo_url: "http://evil" }));
    expect(row).not.toHaveProperty("id"); expect(row).not.toHaveProperty("project_id"); expect(row).not.toHaveProperty("photo_url");
  });
  it("builds a clean slug", () => expect(sponsorshipSlug("Mary Ann O'Neil", "ab12")).toBe("mary-ann-o-neil-ab12"));
});

describe("resolveSponsorship", () => {
  const sp = { status: "active", monthly_amount_cents: 8000 };
  it("uses the stored amount for monthly and one-time gifts", () => {
    expect(resolveSponsorship("monthly", sp)).toEqual({ ok: true, amountCents: 8000, tierId: null });
    expect(resolveSponsorship("one_time", sp)).toMatchObject({ ok: true, amountCents: 8000 });
  });
  it("rejects yearly, inactive, archived and missing sponsorships", () => {
    expect(resolveSponsorship("yearly", sp).ok).toBe(false);
    for (const status of ["inactive", "archived"]) expect(resolveSponsorship("monthly", { ...sp, status }).ok).toBe(false);
    expect(resolveSponsorship("monthly", null).ok).toBe(false);
  });
  it("the checkout schema accepts a sponsorship destination", () => {
    const base = { idempotencyKey: "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d", frequency: "monthly", tierId: null, customAmountCents: null,
      donor: { firstName: "A", lastName: "B" }, anonymous: false, marketingOptIn: false, projectUpdatesOptIn: false, dedication: null };
    expect(checkoutSchema.safeParse({ ...base, destination: { kind: "sponsorship", sponsorshipId: "6a1c2b5f-2d2f-4c8f-8b62-2a3a4b5c6d7e" } }).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...base, destination: { kind: "sponsorship", sponsorshipId: "nope" } }).success).toBe(false);
  });
});
