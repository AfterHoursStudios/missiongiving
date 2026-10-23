import { fillTemplate, htmlToText, sanitizeEmailHtml, type TemplateVars } from "@/lib/messages";
import { publicEnv } from "@/lib/env";
import { newsletterDesignSchema, newsletterText, renderNewsletterHtml } from "./newsletter";
import type { Rendered } from "./render";

export interface NewsletterRenderInput {
  subject: string; design: unknown; vars: TemplateVars;
  org: { name: string; address: string }; unsubscribeUrl: string; oneClickUrl: string;
}

/** The plain-text part is not HTML: show "Smith & Jones", not "Smith &amp; Jones". */
const decodeEntities = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** The logo shown in the newsletter masthead (served from the site, so email apps can load it). */
export const newsletterLogoUrl = () => `${publicEnv.NEXT_PUBLIC_APP_URL}/images/mg-logo.png`;

/**
 * Personalizes one newsletter for one recipient. The design is re-validated, merge-field values are escaped, rich
 * text is sanitized, and the RFC 8058 one-click unsubscribe headers are added, the same as other campaign email.
 */
export async function renderNewsletterEmail(i: NewsletterRenderInput): Promise<Rendered> {
  const design = newsletterDesignSchema.parse(i.design);
  const fillText = (s: string) => fillTemplate(s, i.vars, "text");
  const subject = fillText(i.subject).replace(/[\r\n]+/g, " ").trim(); // no header injection via names
  const html = renderNewsletterHtml(design, i.subject, {
    orgName: i.org.name, orgAddress: i.org.address, logoUrl: newsletterLogoUrl(), fillText,
    clean: (h) => sanitizeEmailHtml(fillTemplate(h, i.vars, "html")),
    unsubscribeUrl: i.unsubscribeUrl, preferencesUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/dashboard`,
  });
  const text = newsletterText(design, {
    fillText, toText: (h) => decodeEntities(htmlToText(sanitizeEmailHtml(fillTemplate(h, i.vars, "html")))),
    orgName: i.org.name, orgAddress: i.org.address, unsubscribeUrl: i.unsubscribeUrl,
  });
  return { subject, html, text, headers: { "List-Unsubscribe": `<${i.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}
