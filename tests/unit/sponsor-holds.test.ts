import { describe, expect, it } from "vitest";
import { holdsSponsorship } from "@/lib/sponsor/holds";

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
