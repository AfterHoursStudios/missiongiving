import sanitizeHtml from "sanitize-html";

import { TEMPLATE_VARIABLES, type TemplateVariable } from "./template-variables";
import { EMAIL_FONT_PATTERNS } from "./email-fonts";

export { TEMPLATE_VARIABLES, type TemplateVariable };
export type TemplateVars = Partial<Record<TemplateVariable, string>>;

const ALLOWED = new Set<string>(TEMPLATE_VARIABLES);
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Substitutes only allow-listed variables. Values are HTML-escaped; unknown placeholders are left empty, never evaluated. */
export function fillTemplate(text: string, vars: TemplateVars, mode: "html" | "text" = "html") {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => {
    if (!ALLOWED.has(name)) return "";
    const v = vars[name as TemplateVariable] ?? "";
    return mode === "html" ? escapeHtml(v) : v;
  });
}

const ALIGN = { "text-align": [/^(left|right|center|justify)$/] };

/**
 * Email markup from the template builder: text formatting, alignment, fonts and text sizes, links and pictures. Pictures must be
 * https URLs (ours are in the email-images bucket); scripts, event handlers, other styles and data: URLs are removed.
 */
export function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "em", "b", "i", "u", "s", "ul", "ol", "li", "h2", "h3", "a", "blockquote", "span", "img"],
    allowedAttributes: {
      a: ["href", "title", "rel", "target"], img: ["src", "alt", "width", "height", "style"], span: ["style"],
      p: ["style"], h2: ["style"], h3: ["style"], li: ["style"],
    },
    allowedStyles: {
      p: ALIGN, h2: ALIGN, h3: ALIGN, li: ALIGN,
      span: { "font-size": [/^\d{1,2}px$/], "font-family": EMAIL_FONT_PATTERNS },
      img: { "max-width": [/^100%$/], height: [/^auto$/] },
    },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
      // Scales down on narrow screens instead of overflowing the email.
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, style: "max-width:100%;height:auto" } }),
    },
  });
}

/** Strips tags for the plain-text alternative, first turning block boundaries into blank lines so paragraphs, list items and headings that were visually separated in the HTML stay separated in the text version. */
export function htmlToText(html: string) {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h2|h3|blockquote)>/gi, "\n\n");
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} }).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface Template { subject: string; body_html: string; body_text: string }

/**
 * Tier-specific email message overrides the general template body when configured.
 * The subject always comes from the template so wording stays consistent per event type.
 */
export function renderDonationMessage(template: Template, tierEmailMessage: string | null | undefined, vars: TemplateVars) {
  const override = tierEmailMessage?.trim();
  const bodyHtmlSource = override ? `<p>${escapeHtml(override).replace(/\n/g, "<br>")}</p>` : template.body_html;
  const bodyTextSource = override ?? template.body_text;
  return {
    subject: fillTemplate(template.subject, vars, "text"),
    html: sanitizeEmailHtml(fillTemplate(bodyHtmlSource, vars, "html")),
    text: fillTemplate(bodyTextSource, vars, "text"),
    usedTierOverride: Boolean(override),
  };
}

/** Confirmation-page message: tier message first, then the org default. */
export function pickConfirmationMessage(tierMessage: string | null | undefined, orgDefault: string) {
  return tierMessage?.trim() || orgDefault;
}
