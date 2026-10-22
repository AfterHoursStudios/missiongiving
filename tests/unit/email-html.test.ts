import { describe, expect, it } from "vitest";
import { htmlToText, sanitizeEmailHtml } from "@/lib/messages";

describe("sanitizeEmailHtml (template builder output)", () => {
  it("keeps formatting, alignment, text size, links and https pictures", () => {
    const html = '<p style="text-align: center"><strong>Thanks</strong> <u>so</u> <span style="font-size: 18px">much</span></p>'
      + '<h2 style="text-align: right">Hi</h2><p><a href="https://example.org">site</a></p>'
      + '<img src="https://x.supabase.co/storage/v1/object/public/email-images/templates/a.png" alt="Signature" width="240">';
    const out = sanitizeEmailHtml(html);
    expect(out).toContain('<p style="text-align:center">');
    expect(out).toContain('<span style="font-size:18px">much</span>');
    expect(out).toContain("<u>so</u>");
    expect(out).toContain('<h2 style="text-align:right">');
    expect(out).toMatch(/<img src="https:\/\/x\.supabase\.co[^"]+" alt="Signature" width="240" style="max-width:100%;height:auto" \/>/);
  });

  it("removes unsafe or unsupported markup", () => {
    const out = sanitizeEmailHtml('<img src="data:image/png;base64,AAAA"><img src="http://e.org/a.png" onerror="x()">'
      + '<p style="color: red; text-align: center; background: url(x)">a</p><span style="font-size: 9999px">b</span><script>alert(1)</script>');
    expect(out).not.toMatch(/data:|http:|onerror|script|color|background|9999/);
    expect(out).toContain('<p style="text-align:center">a</p>');
  });

  it("builds a plain-text version from the formatted message", () => {
    expect(htmlToText(sanitizeEmailHtml("<p>Hello {{donor_first_name}},</p><ul><li>One</li></ul><p><img src=\"https://e.org/a.png\"></p>")))
      .toBe("Hello {{donor_first_name}},\n\nOne");
  });
});

describe("email fonts", () => {
  it("keeps the builder's fonts, quoted or not, and drops any other font", () => {
    expect(sanitizeEmailHtml('<span style="font-family: Georgia, serif">a</span>')).toBe('<span style="font-family:Georgia, serif">a</span>');
    expect(sanitizeEmailHtml('<span style="font-family: &quot;Times New Roman&quot;, Times, serif">a</span>')).toContain("Times New Roman");
    expect(sanitizeEmailHtml('<span style="font-family: Comic Sans MS">a</span>')).toBe("<span>a</span>");
    expect(sanitizeEmailHtml('<span style="font-family: Arial, url(x)">a</span>')).toBe("<span>a</span>");
  });
});
