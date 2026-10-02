import { describe, expect, it } from "vitest";
import { SUMMARY_MAX, formatRichText, htmlToEditableText, projectSchema, sanitizeStory } from "@/lib/admin/project-schema";

describe("formatRichText (keeps the formatting staff type)", () => {
  it("turns blank lines into paragraphs and single Enters into line breaks", () => {
    expect(formatRichText("First paragraph.\n\nSecond line one\nsecond line two")).toBe("<p>First paragraph.</p><p>Second line one<br>second line two</p>");
    expect(formatRichText("A\r\n\r\n\r\nB")).toBe("<p>A</p><p>B</p>");
  });
  it("turns lines starting with a dash or asterisk into a bullet list", () => {
    expect(formatRichText("Intro\n\n- one\n- two\n* three")).toBe("<p>Intro</p><ul><li>one</li><li>two</li><li>three</li></ul>");
  });
  it("escapes plain text but does not double-escape existing entities", () => {
    expect(formatRichText("a < b & c > d")).toBe("<p>a &lt; b &amp; c &gt; d</p>");
    expect(formatRichText("Tom &amp; Jerry")).toBe("<p>Tom &amp; Jerry</p>");
  });
  it("passes text that already contains HTML through unchanged", () => {
    const html = "<h2>Title</h2><p>Body</p>";
    expect(formatRichText(html)).toBe(html);
  });
  it("is safe after sanitizing, and a save-then-display round trip keeps the formatting", () => {
    expect(sanitizeStory(formatRichText("Hi\n\n<script>alert(1)</script>"))).not.toMatch(/<script/i);
    const saved = projectSchema.parse({ title: "T", status: "draft", story_html: "Para one & more.\n\nPara two\nnext line" }).story_html!;
    expect(sanitizeStory(formatRichText(saved))).toBe("<p>Para one &amp; more.</p><p>Para two<br />next line</p>");
  });
});

describe("htmlToEditableText (the inverse of formatRichText, for re-editing a template as plain text)", () => {
  it("round-trips formatRichText's own output exactly, including a bulleted list", () => {
    for (const text of ["First paragraph.\n\nSecond line one\nsecond line two", "Intro\n\n- one\n- two\n- three", "Just one line"])
      expect(htmlToEditableText(formatRichText(text))).toBe(text);
  });
  it("collapses other HTML (e.g. a seeded template) to reasonably readable plain text", () => {
    expect(htmlToEditableText("<p>Hello {{donor_first_name}}, please verify your email.</p>")).toBe("Hello {{donor_first_name}}, please verify your email.");
  });
});

describe("summary length", () => {
  const base = { title: "T", status: "draft" };
  it("allows up to 1000 characters and rejects more", () => {
    expect(SUMMARY_MAX).toBe(1000);
    expect(projectSchema.safeParse({ ...base, summary: "x".repeat(1000) }).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, summary: "x".repeat(1001) }).success).toBe(false);
  });
});
