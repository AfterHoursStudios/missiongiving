import { z } from "zod";

/**
 * Newsletters (Mailing/Forms → Newsletters): the block format the builder edits and the email HTML generated from it.
 * Client-safe, so the builder's live preview and the real send use the same renderer. Every text value is escaped and
 * every link and picture must be https (or mailto for links); rich text is passed through `clean`, which on the server
 * fills merge fields and sanitizes (sanitizeEmailHtml).
 *
 * The layout is table-based with inline styles, the form email apps (Outlook, Gmail, Apple Mail) render reliably, and
 * stacks two-column stories on phones.
 */

export const ACCENTS = [
  { value: "#024352", label: "Deep teal" }, { value: "#2a78d6", label: "Blue" }, { value: "#1c7c54", label: "Green" },
  { value: "#b4441f", label: "Rust" }, { value: "#6250d6", label: "Violet" }, { value: "#14262b", label: "Charcoal" },
] as const;

const httpsUrl = z.string().trim().max(2000).refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/i.test(v), "Links and pictures must start with https://");
const linkUrl = z.string().trim().max(2000).refine((v) => v === "" || /^(https:\/\/|mailto:)[^\s"'<>]+$/i.test(v), "Links must start with https:// or mailto:");
const text = (max: number) => z.string().max(max);
const align = z.enum(["left", "center", "right"]).default("left");
const id = z.string().min(1).max(40);

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("heading"), text: text(200), size: z.enum(["large", "medium"]).default("large"), align }),
  z.object({ id, type: z.literal("text"), html: text(40_000) }),
  z.object({ id, type: z.literal("image"), src: httpsUrl, alt: text(300), link: linkUrl.default(""), caption: text(300).default(""), width: z.enum(["full", "medium", "small"]).default("full"), align: align }),
  z.object({ id, type: z.literal("button"), label: text(80), url: linkUrl, align: align.default("center") }),
  z.object({
    id, type: z.literal("story"), title: text(200), html: text(20_000), image: httpsUrl.default(""), alt: text(300).default(""),
    imageSide: z.enum(["left", "right", "top"]).default("left"), linkLabel: text(80).default(""), linkUrl: linkUrl.default(""),
  }),
  z.object({ id, type: z.literal("divider") }),
  z.object({ id, type: z.literal("spacer"), size: z.enum(["small", "medium", "large"]).default("medium") }),
]);
export type NewsletterBlock = z.infer<typeof blockSchema>;
export type BlockType = NewsletterBlock["type"];

export const newsletterDesignSchema = z.object({
  preheader: text(200).default(""),
  accent: z.string().refine((v) => ACCENTS.some((a) => a.value === v), "Choose one of the colors").default(ACCENTS[0].value),
  title: text(120).default(""),
  dateLine: text(120).default(""),
  showLogo: z.boolean().default(true),
  blocks: z.array(blockSchema).max(80),
});
export type NewsletterDesign = z.infer<typeof newsletterDesignSchema>;

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading", text: "Text", image: "Picture", button: "Button", story: "Story (picture + text)", divider: "Divider", spacer: "Space",
};

let seq = 0;
export const newBlockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newBlock(type: BlockType): NewsletterBlock {
  const id = newBlockId();
  switch (type) {
    case "heading": return { id, type, text: "Section heading", size: "large", align: "left" };
    case "text": return { id, type, html: "<p>Write your update here. Use the toolbar for bold, links, lists and more.</p>" };
    case "image": return { id, type, src: "", alt: "", link: "", caption: "", width: "full", align: "center" };
    case "button": return { id, type, label: "Give today", url: "", align: "center" };
    case "story": return { id, type, title: "Story title", html: "<p>A short summary of the story.</p>", image: "", alt: "", imageSide: "left", linkLabel: "Read more", linkUrl: "" };
    case "divider": return { id, type };
    case "spacer": return { id, type, size: "medium" };
  }
}

/** A sensible starting newsletter: masthead, welcome, a story and a giving button. */
export function starterDesign(orgName: string, monthLabel: string): NewsletterDesign {
  return {
    preheader: `News and stories from ${orgName}`, accent: ACCENTS[0].value, title: `${orgName} News`, dateLine: monthLabel, showLogo: true,
    blocks: [
      { id: newBlockId(), type: "text", html: "<p>Dear {{donor_first_name}},</p><p>Thank you for being part of this work. Here is what your support made possible this month.</p>" },
      { ...newBlock("story"), title: "Story from the field" } as NewsletterBlock,
      { id: newBlockId(), type: "divider" },
      { ...newBlock("button"), label: "Give today" } as NewsletterBlock,
    ],
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeHref = (u: string) => (/^(https:\/\/|mailto:)[^\s"'<>]+$/i.test(u.trim()) ? esc(u.trim()) : "");
const safeSrc = (u: string) => (/^https:\/\/[^\s"'<>]+$/i.test(u.trim()) ? esc(u.trim()) : "");

export interface RenderNewsletterOptions {
  orgName: string; orgAddress: string; logoUrl: string;
  /** Fills merge fields in plain text (subject, headings, labels). */
  fillText: (s: string) => string;
  /** Fills merge fields in rich text and sanitizes it (server: fillTemplate + sanitizeEmailHtml). */
  clean: (html: string) => string;
  unsubscribeUrl: string; preferencesUrl: string;
}

const FONT = "Helvetica, Arial, sans-serif";
const INK = "#14262b", SOFT = "#46595f";

/** The complete email document for one recipient. */
export function renderNewsletterHtml(design: NewsletterDesign, subject: string, o: RenderNewsletterOptions): string {
  const t = (s: string) => esc(o.fillText(s));
  const a = design.accent;
  const rich = (html: string) => `<div style="font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">${o.clean(html)}</div>`;
  const row = (inner: string, pad = "12px 32px") => `<tr><td class="px" style="padding:${pad};">${inner}</td></tr>`;
  const button = (label: string, url: string, alignTo: string) => {
    const href = safeHref(url);
    if (!href || !label.trim()) return "";
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${alignTo}" style="margin:${alignTo === "center" ? "0 auto" : "0"};"><tr><td style="border-radius:6px;background:${a};">`
      + `<a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">${t(label)}</a></td></tr></table>`;
  };
  const picture = (src: string, alt: string, width: number, href: string) => {
    const s = safeSrc(src);
    if (!s) return "";
    const img = `<img src="${s}" alt="${t(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:6px;" />`;
    const h = safeHref(href);
    return h ? `<a href="${h}">${img}</a>` : img;
  };

  const blocks = design.blocks.map((b) => {
    switch (b.type) {
      case "heading": {
        const size = b.size === "large" ? 26 : 20;
        return row(`<h2 style="margin:0;font-family:${FONT};font-size:${size}px;line-height:1.25;font-weight:700;color:${INK};text-align:${b.align};">${t(b.text)}</h2>`, "20px 32px 4px");
      }
      case "text": return row(rich(b.html));
      case "image": {
        const w = b.width === "full" ? 536 : b.width === "medium" ? 400 : 260;
        const img = picture(b.src, b.alt, w, b.link);
        if (!img) return "";
        const cap = b.caption.trim() ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:1.4;color:${SOFT};text-align:${b.align};">${t(b.caption)}</p>` : "";
        return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${b.align}" style="margin:${b.align === "center" ? "0 auto" : "0"};"><tr><td>${img}${cap}</td></tr></table>`);
      }
      case "button": return row(button(b.label, b.url, b.align), "16px 32px");
      case "divider": return row(`<div style="border-top:1px solid #d9e3df;font-size:0;line-height:0;">&nbsp;</div>`, "16px 32px");
      case "spacer": return `<tr><td style="height:${b.size === "small" ? 12 : b.size === "medium" ? 24 : 48}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
      case "story": {
        const img = picture(b.image, b.alt, b.imageSide === "top" ? 536 : 250, b.linkUrl);
        const body = `<h3 style="margin:0 0 8px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:700;color:${INK};">${t(b.title)}</h3>${rich(b.html)}`
          + (b.linkLabel.trim() && safeHref(b.linkUrl) ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:16px;"><a href="${safeHref(b.linkUrl)}" style="color:${a};font-weight:700;text-decoration:underline;">${t(b.linkLabel)} &rarr;</a></p>` : "");
        if (!img) return row(body);
        if (b.imageSide === "top") return row(`${img}<div style="height:16px;"></div>${body}`);
        // Two columns side by side; they stack on narrow screens (see the .col rule in <head>).
        const imgCol = `<td class="col" width="250" valign="top" style="width:250px;padding:0;">${img}</td>`;
        const gap = `<td class="gap" width="24" style="width:24px;font-size:0;">&nbsp;</td>`;
        const textCol = `<td class="col" valign="top" style="padding:0;">${body}</td>`;
        const cols = b.imageSide === "left" ? imgCol + gap + textCol : textCol + gap + imgCol;
        return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cols}</tr></table>`, "16px 32px");
      }
    }
  }).join("");

  const logo = design.showLogo && safeSrc(o.logoUrl) ? `<img src="${safeSrc(o.logoUrl)}" alt="${esc(o.orgName)}" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;margin:0 0 16px;" />` : "";
  const masthead = (logo || design.title.trim() || design.dateLine.trim())
    ? `<tr><td class="px" style="padding:28px 32px 20px;border-bottom:4px solid ${a};">${logo}`
      + (design.title.trim() ? `<h1 style="margin:0;font-family:${FONT};font-size:30px;line-height:1.2;font-weight:700;color:${a};">${t(design.title)}</h1>` : "")
      + (design.dateLine.trim() ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:14px;color:${SOFT};">${t(design.dateLine)}</p>` : "")
      + `</td></tr>`
    : "";
  const footer = `<tr><td class="px" style="padding:24px 32px 32px;border-top:1px solid #d9e3df;font-family:${FONT};font-size:12px;line-height:1.6;color:${SOFT};">`
    + `<p style="margin:0;">You are receiving this because you chose to get news emails from ${esc(o.orgName)}.${o.orgAddress.trim() ? ` ${esc(o.orgAddress)}` : ""}</p>`
    + `<p style="margin:8px 0 0;"><a href="${safeHref(o.preferencesUrl)}" style="color:${SOFT};text-decoration:underline;">Email preferences</a> &middot; <a href="${safeHref(o.unsubscribeUrl)}" style="color:${SOFT};text-decoration:underline;">Unsubscribe</a></p></td></tr>`;
  const pre = design.preheader.trim() ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${t(design.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(o.fillText(subject))}</title>`
    + `<style>a{color:${a};}img{-ms-interpolation-mode:bicubic;}p{margin:0 0 12px;}ul,ol{margin:0 0 12px;padding-left:24px;}`
    + `@media (max-width:620px){.wrap{width:100%!important;}.px{padding-left:20px!important;padding-right:20px!important;}.col{display:block!important;width:100%!important;}.gap{display:block!important;height:16px!important;width:100%!important;}}</style></head>`
    + `<body style="margin:0;padding:0;background:#eef3f1;">${pre}`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f1;"><tr><td align="center" style="padding:24px 12px;">`
    + `<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">`
    + masthead + `<tr><td style="height:12px;font-size:0;">&nbsp;</td></tr>` + blocks + `<tr><td style="height:16px;font-size:0;">&nbsp;</td></tr>` + footer
    + `</table></td></tr></table></body></html>`;
}

/** Plain-text version for the email's text part. `toText` converts rich text (server: htmlToText). */
export function newsletterText(design: NewsletterDesign, o: { fillText: (s: string) => string; toText: (html: string) => string; orgName: string; orgAddress: string; unsubscribeUrl: string }): string {
  const parts: string[] = [];
  if (design.title.trim()) parts.push(o.fillText(design.title).toUpperCase());
  if (design.dateLine.trim()) parts.push(o.fillText(design.dateLine));
  for (const b of design.blocks) {
    if (b.type === "heading") parts.push(o.fillText(b.text).toUpperCase());
    else if (b.type === "text") parts.push(o.toText(b.html));
    else if (b.type === "image" && b.caption.trim()) parts.push(o.fillText(b.caption));
    else if (b.type === "button" && b.url) parts.push(`${o.fillText(b.label)}: ${b.url}`);
    else if (b.type === "story") parts.push([o.fillText(b.title).toUpperCase(), o.toText(b.html), b.linkUrl ? `${o.fillText(b.linkLabel || "Read more")}: ${b.linkUrl}` : ""].filter(Boolean).join("\n\n"));
    else if (b.type === "divider") parts.push("----");
  }
  parts.push(`--\nYou are receiving this because you chose to get news emails from ${o.orgName}. ${o.orgAddress}\nUnsubscribe: ${o.unsubscribeUrl}`);
  return parts.filter((p) => p.trim()).join("\n\n");
}
