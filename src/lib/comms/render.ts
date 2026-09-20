import { createElement } from "react";
import { render } from "@react-email/components";
import { CampaignEmail } from "@/emails/campaign";
import { fillTemplate, htmlToText, sanitizeEmailHtml, type TemplateVars } from "@/lib/messages";

export interface RenderInput {
  subject: string; bodyHtml: string; vars: TemplateVars;
  org: { name: string; address: string }; unsubscribeUrl: string; oneClickUrl: string;
}
export interface Rendered { subject: string; html: string; text: string; headers: Record<string, string> }

/**
 * Personalizes and renders one campaign email. Variable values are HTML-escaped and the final body is sanitized again,
 * so a donor's name can never inject markup. Adds RFC 8058 one-click unsubscribe headers.
 */
export async function renderCampaignEmail(i: RenderInput): Promise<Rendered> {
  const subject = fillTemplate(i.subject, i.vars, "text").replace(/[\r\n]+/g, " ").trim(); // no header injection via names
  const bodyHtml = sanitizeEmailHtml(fillTemplate(i.bodyHtml, i.vars, "html"));
  const html = await render(createElement(CampaignEmail, { bodyHtml, orgName: i.org.name, orgAddress: i.org.address, unsubscribeUrl: i.unsubscribeUrl, preview: subject }));
  const text = `${htmlToText(bodyHtml)}\n\n--\nYou are receiving this because you chose to hear from ${i.org.name}. ${i.org.address}\nUnsubscribe: ${i.unsubscribeUrl}\n`;
  return {
    subject, html, text,
    headers: { "List-Unsubscribe": `<${i.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
