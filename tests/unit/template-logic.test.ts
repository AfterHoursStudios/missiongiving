import { describe, expect, it } from "vitest";
import { SAMPLE_VARS, findUnknownVariables, planVersions, templateKeySlug } from "@/lib/admin/template-logic";
import { TEMPLATE_VARIABLES, fillTemplate, htmlToText } from "@/lib/messages";

describe("findUnknownVariables", () => {
  it("flags typos and unsupported placeholders only", () => {
    expect(findUnknownVariables("Hi {{donor_first_name}}", "<p>{{ donation_amount }}</p>")).toEqual([]);
    expect(findUnknownVariables("Hi {{donor_name}}", "{{ constructor }} {{donor_first_name}}")).toEqual(["donor_name", "constructor"]);
  });
});

describe("planVersions", () => {
  it("snapshots the original on first edit, then increments", () => {
    expect(planVersions(0)).toEqual({ snapshotOriginal: true, newVersion: 2 });
    expect(planVersions(5)).toEqual({ snapshotOriginal: false, newVersion: 6 });
  });
});

describe("templateKeySlug", () => {
  it("lowercases and underscore-joins words", () => expect(templateKeySlug("Fall Newsletter")).toBe("fall_newsletter"));
  it("matches the /^[a-z_]+$/ key format required by the [key] route: strips digits, punctuation and hyphens", () => {
    for (const name of ["2026 Year-End Appeal!", "Q1 Update", "  spaced  out  "]) expect(templateKeySlug(name)).toMatch(/^[a-z_]+$/);
    expect(templateKeySlug("2026 Year-End Appeal!")).toBe("year_end_appeal");
  });
  it("falls back rather than producing an empty key", () => expect(templateKeySlug("2026")).toBe("template"));
});

describe("htmlToText (auto-generated plain-text fallback)", () => {
  it("keeps paragraphs and list items visually separated, not run together", () => {
    expect(htmlToText("<p>First paragraph.</p><p>Second line one<br>second line two</p>")).toBe("First paragraph.\n\nSecond line one\nsecond line two");
    expect(htmlToText("<p>Intro</p><ul><li>one</li><li>two</li></ul>")).toBe("Intro\n\none\n\ntwo");
  });
  it("still collapses a single paragraph to plain text", () => expect(htmlToText("<p>Hello there</p>")).toBe("Hello there"));
});

describe("sample data", () => {
  it("covers every supported variable so previews never show blanks", () => {
    for (const v of TEMPLATE_VARIABLES) expect(SAMPLE_VARS[v], v).toBeTruthy();
    expect(fillTemplate("{{donor_first_name}} gave {{donation_amount}}", SAMPLE_VARS)).toBe("Sample gave $50.00");
  });
});
