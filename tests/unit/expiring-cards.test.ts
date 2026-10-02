import { describe, expect, it } from "vitest";
import { buildExpiringCardsDigest, isCardExpiringSoon, type ExpiringCardRow } from "@/lib/admin/expiring-cards-logic";

describe("isCardExpiringSoon", () => {
  const now = new Date("2026-09-21T00:00:00Z");

  it("flags a card expiring within the window", () => expect(isCardExpiringSoon(9, 2026, now, 30)).toBe(true)); // expires end of Sept, ~10 days out
  it("flags a card that has already expired", () => expect(isCardExpiringSoon(8, 2026, now, 0)).toBe(true)); // expired end of August, even with a 0-day window
  it("does not flag a card expiring well outside the window", () => expect(isCardExpiringSoon(3, 2027, now, 30)).toBe(false));
  it("is exact at the boundary (last instant of the exp month)", () => {
    // Sept 2026 ends 2026-09-30T23:59:59.999Z, ~9.9999 days after `now`.
    expect(isCardExpiringSoon(9, 2026, now, 9)).toBe(false);
    expect(isCardExpiringSoon(9, 2026, now, 10)).toBe(true);
  });
});

describe("buildExpiringCardsDigest", () => {
  const opts = { baseUrl: "https://give.example.org", orgName: "Ultimate Mission", currency: "USD", windowDays: 30 };
  const row: ExpiringCardRow = {
    donorId: "d1", donorName: "Asha Kumar", brand: "Visa", last4: "4242", expMonth: 10, expYear: 2026,
    gifts: [{ amountCents: 5000, frequency: "monthly", status: "active" }],
  };

  it("returns null when there is nothing to report", () => expect(buildExpiringCardsDigest([], opts)).toBeNull());

  it("links to the donor's admin page and includes card and gift details", () => {
    const digest = buildExpiringCardsDigest([row], opts)!;
    expect(digest.subject).toContain("1 recurring donor card");
    expect(digest.html).toContain("https://give.example.org/admin/donors/d1");
    expect(digest.html).toContain("Asha Kumar");
    expect(digest.html).toContain("Visa");
    expect(digest.html).toContain("4242");
    expect(digest.html).toContain("10/2026");
    expect(digest.text).toContain("https://give.example.org/admin/donors/d1");
  });

  it("pluralizes the subject and flags past-due gifts", () => {
    const pastDue: ExpiringCardRow = { ...row, donorId: "d2", donorName: "Bo Lin", gifts: [{ amountCents: 2000, frequency: "yearly", status: "past_due" }] };
    const digest = buildExpiringCardsDigest([row, pastDue], opts)!;
    expect(digest.subject).toContain("2 recurring donor cards");
    expect(digest.text).toContain("(past due)");
  });

  it("escapes donor-supplied text", () => {
    const evil: ExpiringCardRow = { ...row, donorName: "<script>alert(1)</script>" };
    const digest = buildExpiringCardsDigest([evil], opts)!;
    expect(digest.html).not.toContain("<script>");
    expect(digest.html).toContain("&lt;script&gt;");
  });
});
