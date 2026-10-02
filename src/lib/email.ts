import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";

export interface OutgoingEmail {
  to: string; subject: string; html: string; text: string;
  replyTo?: string; fromName?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}

/**
 * Sends via Resend. With no RESEND_API_KEY (local dev) it logs only that a message was skipped,
 * never the recipient or content.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<{ id: string | null; skipped: boolean }> {
  // Imported donors without an email have an internal placeholder address; never try to send to it.
  if (isPlaceholderEmail(msg.to)) return { id: null, skipped: true };
  const { RESEND_API_KEY, EMAIL_FROM_ADDRESS } = serverEnv();
  if (!RESEND_API_KEY || !EMAIL_FROM_ADDRESS) {
    console.info("[email] skipped: RESEND_API_KEY / EMAIL_FROM_ADDRESS not configured");
    return { id: null, skipped: true };
  }
  const resend = new Resend(RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: `${msg.fromName ?? "Mission Giving"} <${EMAIL_FROM_ADDRESS}>`,
    to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
    replyTo: msg.replyTo, headers: msg.headers, tags: msg.tags,
  });
  if (error) throw new Error(`email send failed: ${error.name}`);
  return { id: data?.id ?? null, skipped: false };
}
