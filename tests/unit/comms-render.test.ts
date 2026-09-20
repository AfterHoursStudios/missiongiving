import { describe, expect, it } from "vitest";
import { renderCampaignEmail } from "@/lib/comms/render";

const base = {
  subject: "Hello {{donor_first_name}}", bodyHtml: "<p>Hi {{donor_first_name}}, meet {{project_name}}.</p>",
  vars: { donor_first_name: "Sam", project_name: "Clean Water" }, org: { name: "Sample Org", address: "1 Main St, Town OR 97000" },
  unsubscribeUrl: "https://example.org/unsubscribe?t=abc", oneClickUrl: "https://example.org/api/unsubscribe?t=abc",
};

describe("renderCampaignEmail", () => {
  it("personalizes, and includes the address, unsubscribe link and one-click headers", async () => {
    const r = await renderCampaignEmail(base);
    expect(r.subject).toBe("Hello Sam");
    expect(r.html).toContain("Hi Sam, meet Clean Water.");
    expect(r.html).toContain("1 Main St, Town OR 97000");
    expect(r.html).toContain("https://example.org/unsubscribe?t=abc");
    expect(r.text).toContain("Unsubscribe: https://example.org/unsubscribe?t=abc");
    expect(r.headers["List-Unsubscribe"]).toBe("<https://example.org/api/unsubscribe?t=abc>");
    expect(r.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
  it("cannot be used to inject markup or headers through donor-controlled values", async () => {
    const r = await renderCampaignEmail({ ...base, vars: { donor_first_name: '<script>alert(1)</script>\r\nBcc: x@evil.test', project_name: "P" } });
    expect(r.html).not.toContain("<script>alert(1)");
    expect(r.subject).not.toMatch(/[\r\n]/);
  });
  it("sanitizes staff-authored bodies", async () => {
    const r = await renderCampaignEmail({ ...base, bodyHtml: '<p onclick="x()">Hi</p><script>bad()</script><a href="javascript:bad()">x</a>' });
    expect(r.html).not.toMatch(/onclick|<script>bad|javascript:bad/i);
  });
});
