import { describe, expect, it } from "vitest";
import { tierSchema, tierToRow } from "@/lib/admin/tier-schema";

const valid = {
  internal_name: "Tier $25", public_title: "$25", amount: "25", allow_one_time: "on", general_fund: "on", status: "active",
};

describe("tierSchema", () => {
  it("accepts a minimal valid tier and converts dollars to cents", () => {
    const r = tierSchema.parse(valid);
    expect(tierToRow(r)).toMatchObject({ amount_cents: 2500, allow_one_time: true, allow_monthly: false, general_fund: true, project_id: null, image_url: null, featured: false });
  });
  it("rejects bad amounts", () => {
    for (const amount of ["", "abc", "0.50", "-5", "1.234"]) expect(tierSchema.safeParse({ ...valid, amount }).success, amount).toBe(false);
  });
  it("requires at least one frequency and one destination", () => {
    expect(tierSchema.safeParse({ ...valid, allow_one_time: undefined }).success).toBe(false);
    expect(tierSchema.safeParse({ ...valid, general_fund: undefined }).success).toBe(false);
    expect(tierSchema.safeParse({ ...valid, general_fund: undefined, project_id: "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d" }).success).toBe(true);
  });
  it("requires the end date to follow the start date", () => {
    expect(tierSchema.safeParse({ ...valid, active_from: "2026-06-01T00:00", active_until: "2026-05-01T00:00" }).success).toBe(false);
    expect(tierSchema.safeParse({ ...valid, active_from: "2026-06-01T00:00", active_until: "2026-07-01T00:00" }).success).toBe(true);
  });
  it("only allows https images and known statuses", () => {
    expect(tierSchema.safeParse({ ...valid, image_url: "http://x.test/a.png" }).success).toBe(false);
    expect(tierSchema.safeParse({ ...valid, image_url: "javascript:alert(1)" }).success).toBe(false);
    expect(tierSchema.safeParse({ ...valid, image_url: "https://x.test/a.png" }).success).toBe(true);
    expect(tierSchema.safeParse({ ...valid, status: "deleted" }).success).toBe(false);
  });
  it("ignores unknown fields (no mass assignment)", () => {
    const row = tierToRow(tierSchema.parse({ ...valid, id: "x", created_at: "1999", amount_cents: "1" }));
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
    expect(row.amount_cents).toBe(2500);
  });
});
