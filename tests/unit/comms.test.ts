import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { audienceSchema, consentBlock, selectRecipients, type DonorFacts } from "@/lib/comms/audience";
import { mapResendEvent, shouldSuppress, signUnsubscribe, verifySvixSignature, verifyUnsubscribe } from "@/lib/comms/security";
import { zonedLocalToUtc } from "@/lib/comms/schedule";

const NOW = new Date("2026-06-15T12:00:00Z");
const P1 = "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d", P2 = "6a1c2b5f-2d2f-4c8f-8b62-2a3a4b5c6d7e", T1 = "7b2d3c6a-3e3a-4d9a-9c73-3b4b5c6d7e8f";
const donor = (o: Partial<DonorFacts> = {}): DonorFacts => ({
  id: "d" + Math.random(), email: `x${Math.random()}@example.test`, first_name: "Sam", last_name: "Lee", region: "OR", status: "active",
  marketing_email: true, project_updates: true, suppressed: false, lifetime_cents: 10000, last_gift_at: "2026-05-01T00:00:00Z",
  active_monthly: false, active_yearly: false, project_ids: [], tag_ids: [], ...o,
});
const filters = (o: object = {}) => audienceSchema.parse(o);
const pick = (donors: DonorFacts[], f: object = {}, kind: "announcement" | "project_update" = "announcement", suppressed = new Set<string>()) =>
  selectRecipients(donors, filters(f), kind, suppressed, NOW);

describe("consent rules (never message people who opted out)", () => {
  it("announcements need marketing consent; project updates need project-update consent", () => {
    const a = donor({ marketing_email: true, project_updates: false });
    const b = donor({ marketing_email: false, project_updates: true });
    expect(pick([a, b], {}, "announcement").recipients).toEqual([a]);
    expect(pick([a, b], {}, "project_update").recipients).toEqual([b]);
  });
  it("suppressed, do-not-contact, blank-email and list-suppressed donors are always excluded", () => {
    const bad = [donor({ suppressed: true }), donor({ status: "do_not_contact" }), donor({ email: "" }), donor({ email: "Listed@Example.test" })];
    const r = pick([...bad, donor()], {}, "announcement", new Set(["listed@example.test"]));
    expect(r.recipients).toHaveLength(1);
    expect(r.excluded).toMatchObject({ suppressed: 2, do_not_contact: 1, no_email: 1 });
  });
  it("counts donors who did not opt in", () => {
    const r = pick([donor({ marketing_email: false }), donor({ marketing_email: false }), donor()]);
    expect(r.excluded.no_consent).toBe(2);
  });
  it("consentBlock is reusable for the pre-send re-check", () => {
    expect(consentBlock({ email: "a@b.test", status: "active", marketing_email: false, project_updates: false, suppressed: false }, "announcement", new Set())).toBe("no_consent");
    expect(consentBlock({ email: "a@b.test", status: "active", marketing_email: true, project_updates: false, suppressed: false }, "announcement", new Set())).toBeNull();
  });
});

describe("audience filters", () => {
  const monthly = donor({ active_monthly: true }), yearly = donor({ active_yearly: true }), plain = donor();
  it("selects monthly and/or yearly donors (OR within the list)", () => {
    expect(pick([monthly, yearly, plain], { frequencies: ["monthly"] }).recipients).toEqual([monthly]);
    expect(pick([monthly, yearly, plain], { frequencies: ["monthly", "yearly"] }).recipients).toEqual([monthly, yearly]);
  });
  it("selects previous donors of chosen projects", () => {
    const a = donor({ project_ids: [P1] }), b = donor({ project_ids: [P2] });
    expect(pick([a, b, plain], { project_ids: [P1] }).recipients).toEqual([a]);
    expect(pick([a, b, plain], { project_ids: [P1, P2] }).recipients).toEqual([a, b]);
  });
  it("finds lapsed donors (gave before, but not within the period); never-givers are not lapsed", () => {
    const old = donor({ last_gift_at: "2025-01-01T00:00:00Z" }), recent = donor({ last_gift_at: "2026-06-01T00:00:00Z" }), never = donor({ last_gift_at: null });
    expect(pick([old, recent, never], { lapsed_months: 12 }).recipients).toEqual([old]);
  });
  it("filters by lifetime giving range, tags and region", () => {
    const small = donor({ lifetime_cents: 2000 }), big = donor({ lifetime_cents: 50000, tag_ids: [T1], region: "wa" });
    expect(pick([small, big], { min_lifetime: 100 }).recipients).toEqual([big]);
    expect(pick([small, big], { max_lifetime: 100 }).recipients).toEqual([small]);
    expect(pick([small, big], { tag_ids: [T1] }).recipients).toEqual([big]);
    expect(pick([small, big], { region: "WA" }).recipients).toEqual([big]);
  });
  it("combines filters with AND and rejects an inverted range", () => {
    const both = donor({ active_monthly: true, tag_ids: [T1] });
    expect(pick([both, donor({ active_monthly: true })], { frequencies: ["monthly"], tag_ids: [T1] }).recipients).toEqual([both]);
    expect(audienceSchema.safeParse({ min_lifetime: 500, max_lifetime: 100 }).success).toBe(false);
  });
});

describe("unsubscribe tokens", () => {
  const secret = "test-secret-value";
  const donorId = "10000000-0000-4000-8000-00000000000a", campaignId = "20000000-0000-4000-8000-00000000000b";
  it("round-trips with and without a campaign", () => {
    expect(verifyUnsubscribe(secret, signUnsubscribe(secret, donorId, campaignId))).toEqual({ donorId, campaignId });
    expect(verifyUnsubscribe(secret, signUnsubscribe(secret, donorId, null))).toEqual({ donorId, campaignId: null });
  });
  it("rejects tampering, wrong secrets and malformed tokens", () => {
    const t = signUnsubscribe(secret, donorId, null);
    const [p, s] = t.split(".");
    const otherPayload = Buffer.from("30000000-0000-4000-8000-00000000000c.-").toString("base64url");
    for (const bad of [`${otherPayload}.${s}`, `${p}.${s}x`, `${p}`, "", "a.b.c", `${p}.`]) expect(verifyUnsubscribe(secret, bad), bad).toBeNull();
    expect(verifyUnsubscribe("another-secret", t)).toBeNull();
  });
});

describe("webhook signature (Svix)", () => {
  const key = Buffer.from("super-secret-key-bytes");
  const secret = `whsec_${key.toString("base64")}`;
  const body = '{"type":"email.delivered"}', id = "msg_1", ts = "1750000000";
  const sign = (b = body) => "v1," + createHmac("sha256", key).update(`${id}.${ts}.${b}`).digest("base64");
  const base = { secret, id, timestamp: ts, body, nowMs: 1750000100_000 };
  it("accepts a valid signature, including among several", () => {
    expect(verifySvixSignature({ ...base, signatureHeader: sign() })).toBe(true);
    expect(verifySvixSignature({ ...base, signatureHeader: `v1,AAAA ${sign()}` })).toBe(true);
  });
  it("rejects tampered bodies, wrong secrets, missing headers and replays", () => {
    expect(verifySvixSignature({ ...base, signatureHeader: sign(), body: body + " " })).toBe(false);
    expect(verifySvixSignature({ ...base, signatureHeader: sign(), secret: `whsec_${Buffer.from("other").toString("base64")}` })).toBe(false);
    expect(verifySvixSignature({ ...base, signatureHeader: null })).toBe(false);
    expect(verifySvixSignature({ ...base, id: null, signatureHeader: sign() })).toBe(false);
    expect(verifySvixSignature({ ...base, signatureHeader: sign(), nowMs: 1750000100_000 + 3_600_000 })).toBe(false);
  });
});

describe("event mapping and suppression", () => {
  it("maps provider events and ignores unknown ones", () => {
    expect(mapResendEvent("email.delivered")).toBe("delivered");
    expect(mapResendEvent("email.clicked")).toBe("clicked");
    expect(mapResendEvent("contact.created")).toBeNull();
  });
  it("suppresses complaints and permanent bounces only", () => {
    expect(shouldSuppress("complained", undefined)).toBe("complaint");
    expect(shouldSuppress("bounced", { bounce: { type: "Permanent" } })).toBe("bounce");
    expect(shouldSuppress("bounced", undefined)).toBe("bounce");
    expect(shouldSuppress("bounced", { bounce: { type: "Transient" } })).toBeNull();
    expect(shouldSuppress("opened", undefined)).toBeNull();
  });
});

describe("scheduling in the organization's time zone", () => {
  it("converts local wall-clock time, including daylight saving", () => {
    expect(zonedLocalToUtc("2026-01-15T09:00", "America/Los_Angeles")?.toISOString()).toBe("2026-01-15T17:00:00.000Z"); // PST
    expect(zonedLocalToUtc("2026-07-15T09:00", "America/Los_Angeles")?.toISOString()).toBe("2026-07-15T16:00:00.000Z"); // PDT
    expect(zonedLocalToUtc("2026-07-15T09:00", "UTC")?.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });
  it("rejects malformed input", () => {
    expect(zonedLocalToUtc("tomorrow", "UTC")).toBeNull();
    expect(zonedLocalToUtc("2026-07-15", "UTC")).toBeNull();
  });
});
