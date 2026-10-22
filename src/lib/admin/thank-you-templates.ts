import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { fillTemplate, sanitizeEmailHtml, type TemplateVars } from "@/lib/messages";
import { SAMPLE_VARS } from "./template-logic";

/** A message template staff can pick as a gift's thank-you, with its preview already filled in. */
export interface ThankYouChoice { key: string; name: string; subject: string; html: string }

/** Templates that are never a thank-you (they announce a problem), so they aren't offered. */
const NOT_A_THANK_YOU = new Set(["payment_failed", "recurring_canceled", "refund_issued"]);

/**
 * The templates offered under "Add a thank-you message" on the Add gift forms. Previews use sample gift details,
 * with the donor's own name when the donor is known, so staff see roughly what the donor will get.
 */
export async function loadThankYouChoices(donor?: { firstName: string; lastName: string }): Promise<ThankYouChoice[]> {
  const { data } = await createSupabaseAdminClient().from("message_templates").select("key, name, subject, body_html").order("name");
  const vars: TemplateVars = donor ? { ...SAMPLE_VARS, donor_first_name: donor.firstName, donor_full_name: `${donor.firstName} ${donor.lastName}` } : SAMPLE_VARS;
  return (data ?? []).filter((t) => !NOT_A_THANK_YOU.has(t.key)).map((t) => ({
    key: t.key, name: t.name,
    subject: fillTemplate(t.subject, vars, "text"),
    html: sanitizeEmailHtml(fillTemplate(t.body_html, vars, "html")),
  }));
}
