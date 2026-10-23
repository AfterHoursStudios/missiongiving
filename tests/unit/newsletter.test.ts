import { describe, expect, it } from "vitest";
import { newBlock, newsletterDesignSchema, newsletterText, renderNewsletterHtml, starterDesign, type NewsletterDesign } from "@/lib/comms/newsletter";
import { renderNewsletterEmail } from "@/lib/comms/render-newsletter";

const opts = {
  orgName: "Ultimate Mission", orgAddress: "PO Box 1, Walla Walla WA", logoUrl: "https://example.org/logo.png",
  fillText: (s: string) => s.replace(/\{\{donor_first_name\}\}/g, "Ann"), clean: (h: string) => h,
  unsubscribeUrl: "https://example.org/unsubscribe?t=abc", preferencesUrl: "https://example.org/dashboard",
};
const design = (blocks: NewsletterDesign["blocks"], over: Partial<NewsletterDesign> = {}): NewsletterDesign =>
  newsletterDesignSchema.parse({ preheader: "", accent: "#024352", title: "News", dateLine: "October 2026", showLogo: true, blocks, ...over });

describe("newsletter design", () => {
  it("accepts the starter layout and every new block type", () => {
    expect(newsletterDesignSchema.safeParse(starterDesign("Ultimate Mission", "October 2026")).success).toBe(true);
    for (const t of ["heading", "text", "image", "button", "story", "divider", "spacer"] as const) expect(newsletterDesignSchema.safeParse({ ...design([]), blocks: [newBlock(t)] }).success).toBe(true);
  });
  it("rejects non-https pictures and links, and colors outside the palette", () => {
    expect(newsletterDesignSchema.safeParse({ ...design([]), blocks: [{ ...newBlock("image"), src: "http://example.org/a.png" }] }).success).toBe(false);
    expect(newsletterDesignSchema.safeParse({ ...design([]), blocks: [{ ...newBlock("button"), url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(newsletterDesignSchema.safeParse({ ...design([]), accent: "#ff00ff" }).success).toBe(false);
  });
});

describe("renderNewsletterHtml", () => {
  it("escapes text, fills merge fields and includes the masthead, footer and unsubscribe link", () => {
    const html = renderNewsletterHtml(design([{ ...newBlock("heading"), text: "Hi {{donor_first_name}} <script>" } as never]), "Hello {{donor_first_name}}", opts);
    expect(html).toContain("Hi Ann &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<title>Hello Ann</title>");
    expect(html).toContain('src="https://example.org/logo.png"');
    expect(html).toContain('href="https://example.org/unsubscribe?t=abc"');
    expect(html).toContain("PO Box 1, Walla Walla WA");
  });
  it("lays a story out in two columns that stack on phones, and drops empty pictures and buttons", () => {
    const story = { ...newBlock("story"), image: "https://example.org/p.jpg", linkUrl: "https://example.org/projects/wells", imageSide: "right" } as never;
    const html = renderNewsletterHtml(design([story, newBlock("image"), { ...newBlock("button"), url: "" } as never]), "S", opts);
    expect(html).toMatch(/class="col"[^>]*valign="top" style="padding:0;">[\s\S]*class="gap"[\s\S]*class="col" width="250"/); // text first, then the picture
    expect(html).toContain("@media (max-width:620px)");
    expect(html.match(/<img /g)?.length).toBe(2); // logo + story picture; the empty picture block renders nothing
    expect(html).not.toContain("Give today"); // button without a link
  });
});

describe("renderNewsletterEmail (server)", () => {
  it("sanitizes rich text, fills each donor's details and adds one-click unsubscribe headers", async () => {
    const d = design([{ ...newBlock("text"), html: '<p>Dear {{donor_first_name}},</p><img src="x" onerror="alert(1)"><script>bad()</script>' } as never]);
    const r = await renderNewsletterEmail({
      subject: "News for {{donor_first_name}}", design: d, vars: { donor_first_name: "<b>Bo</b>" },
      org: { name: "Ultimate Mission", address: "PO Box 1" }, unsubscribeUrl: "https://example.org/u", oneClickUrl: "https://example.org/api/u",
    });
    expect(r.subject).toBe("News for <b>Bo</b>");
    expect(r.html).toContain("Dear &lt;b&gt;Bo&lt;/b&gt;,");
    expect(r.html).not.toMatch(/onerror|<script>bad/);
    expect(r.headers["List-Unsubscribe"]).toBe("<https://example.org/api/u>");
    expect(r.text).toContain("Dear <b>Bo</b>,");
    expect(r.text).toContain("Unsubscribe: https://example.org/u");
  });
  it("writes a plain-text version with headings, buttons and story links", () => {
    const d = design([{ ...newBlock("heading"), text: "Wells" } as never, { ...newBlock("button"), label: "Give", url: "https://example.org/give" } as never]);
    const text = newsletterText(d, { fillText: (s) => s, toText: (h) => h, orgName: "UM", orgAddress: "PO Box 1", unsubscribeUrl: "https://example.org/u" });
    expect(text).toContain("WELLS");
    expect(text).toContain("Give: https://example.org/give");
  });
});
