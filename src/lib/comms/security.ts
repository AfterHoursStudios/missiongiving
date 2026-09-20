import { createHmac, timingSafeEqual } from "node:crypto";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Unsubscribe tokens are HMAC-signed, not guessable, and carry no expiry (an unsubscribe link must keep working).
 * The token identifies a donor (and optionally the campaign that sent it) but grants nothing except unsubscribing.
 */
export function signUnsubscribe(secret: string, donorId: string, campaignId: string | null): string {
  const payload = b64u(`${donorId}.${campaignId ?? "-"}`);
  return `${payload}.${b64u(createHmac("sha256", secret).update(`unsub:${payload}`).digest())}`;
}

export function verifyUnsubscribe(secret: string, token: string): { donorId: string; campaignId: string | null } | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(`unsub:${payload}`).digest();
  let given: Buffer;
  try { given = Buffer.from(sig, "base64url"); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [donorId, campaignId] = Buffer.from(payload, "base64url").toString("utf8").split(".");
  if (!UUID.test(donorId ?? "") || !(campaignId === "-" || UUID.test(campaignId ?? ""))) return null;
  return { donorId, campaignId: campaignId === "-" ? null : campaignId };
}

/**
 * Verifies a Svix-style webhook signature (used by Resend). Signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the
 * base64-decoded secret (after the `whsec_` prefix). Rejects stale timestamps to block replays.
 */
export function verifySvixSignature(a: {
  secret: string; id: string | null; timestamp: string | null; signatureHeader: string | null; body: string; nowMs?: number; toleranceSec?: number;
}): boolean {
  if (!a.id || !a.timestamp || !a.signatureHeader) return false;
  const ts = Number(a.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs((a.nowMs ?? Date.now()) / 1000 - ts) > (a.toleranceSec ?? 300)) return false;
  const key = Buffer.from(a.secret.startsWith("whsec_") ? a.secret.slice(6) : a.secret, "base64");
  const expected = createHmac("sha256", key).update(`${a.id}.${a.timestamp}.${a.body}`).digest();
  return a.signatureHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type MappedEvent = "sent" | "delivered" | "delayed" | "bounced" | "complained" | "opened" | "clicked" | "failed";
const MAP: Record<string, MappedEvent> = {
  "email.sent": "sent", "email.delivered": "delivered", "email.delivery_delayed": "delayed", "email.bounced": "bounced",
  "email.complained": "complained", "email.opened": "opened", "email.clicked": "clicked", "email.failed": "failed",
};
export const mapResendEvent = (type: string): MappedEvent | null => MAP[type] ?? null;

/** Spam complaints and permanent bounces suppress the address. Temporary bounces do not. */
export function shouldSuppress(event: MappedEvent, data: { bounce?: { type?: string } } | undefined): "bounce" | "complaint" | null {
  if (event === "complained") return "complaint";
  if (event === "bounced") {
    const t = data?.bounce?.type?.toLowerCase();
    return !t || t === "permanent" || t === "hard" ? "bounce" : null; // unknown severity is treated as permanent (safer)
  }
  return null;
}
