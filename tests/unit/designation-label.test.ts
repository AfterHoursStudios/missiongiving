import { describe, expect, it } from "vitest";
import { donorFacingDesignation } from "@/lib/donations/designation-label";

describe("donorFacingDesignation", () => {
  it("never names a sponsored woman", () => expect(donorFacingDesignation({ title: "Sponsor: Pramila Rani N.", kind: "sponsorship" })).toBe("Sponsorship"));
  it("keeps project titles", () => expect(donorFacingDesignation({ title: "Every Girl Fundraising", kind: "project" })).toBe("Every Girl Fundraising"));
  it("falls back to the General Fund", () => expect(donorFacingDesignation(null)).toBe("General Fund"));
});
