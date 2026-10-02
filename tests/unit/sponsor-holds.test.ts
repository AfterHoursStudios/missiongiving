import { describe, expect, it } from "vitest";
import { donorSponsorships, holdsSponsorship } from "@/lib/sponsor/holds";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("holdsSponsorship", () => {
  it("active and past-due monthly gifts mean she has a sponsor", () => {
    expect(holdsSponsorship("active", ago(1000), NOW)).toBe(true);
    expect(holdsSponsorship("past_due", ago(1000), NOW)).toBe(true);
  });
  it("a gift awaiting its first payment holds her for 48 hours only", () => {
    expect(holdsSponsorship("incomplete", ago(2), NOW)).toBe(true);
    expect(holdsSponsorship("incomplete", ago(49), NOW)).toBe(false);
  });
  it("canceled, paused and completed gifts release her", () => {
    for (const s of ["canceled", "paused", "completed"]) expect(holdsSponsorship(s, ago(1), NOW), s).toBe(false);
  });
});

describe("donorSponsorships (who a donor sees as their sponsored woman)", () => {
  const P = "proj-1";
  const sponsorships = new Set([P]);
  const now = Date.parse("2026-10-01T12:00:00Z");
  const monthly = (status: string, amount_cents = 3500, created_at = "2026-01-01T00:00:00Z") => ({ project_id: P, status, amount_cents, created_at });
  const paid = { project_id: P, status: "succeeded" };

  it("shows a live monthly sponsorship with its amount", () => {
    expect(donorSponsorships([paid], [monthly("active")], sponsorships, now).get(P)).toBe(3500);
    expect(donorSponsorships([paid], [monthly("past_due")], sponsorships, now).get(P)).toBe(3500);
  });
  it("drops her once the monthly sponsorship is canceled, even with past payments", () => {
    expect(donorSponsorships([paid, paid], [monthly("canceled")], sponsorships, now).has(P)).toBe(false);
    expect(donorSponsorships([paid], [monthly("completed")], sponsorships, now).has(P)).toBe(false);
  });
  it("keeps one-time givers who never sponsored her monthly, as a thank-you", () => {
    expect(donorSponsorships([paid], [], sponsorships, now).get(P)).toBeNull();
    expect(donorSponsorships([{ project_id: P, status: "failed" }], [], sponsorships, now).has(P)).toBe(false);
  });
  it("ignores gifts to projects that aren't sponsorships", () => {
    expect(donorSponsorships([{ project_id: "other", status: "succeeded" }], [{ ...monthly("active"), project_id: "other" }], sponsorships, now).size).toBe(0);
  });
});
