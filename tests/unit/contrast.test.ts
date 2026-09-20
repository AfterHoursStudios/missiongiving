import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Reads the design tokens straight from globals.css so the test can't drift from what ships. */
const css = readFileSync("src/app/globals.css", "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const token = (name: string) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(root);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const WHITE = "#ffffff";

describe("WCAG contrast of design tokens", () => {
  it("computes known reference ratios correctly", () => {
    expect(contrast("#000000", WHITE)).toBeCloseTo(21, 0);
    expect(contrast("#777777", WHITE)).toBeCloseTo(4.48, 1);
  });

  // Normal text needs 4.5:1 (AA). Every text/background pair the UI actually uses:
  const TEXT_PAIRS: [string, string, string][] = [
    ["ink", "paper", "body text"], ["ink", "paper-2", "body text on tinted sections"], ["ink", "brand-50", "selected option"],
    ["ink-soft", "paper", "secondary text"], ["ink-soft", "paper-2", "secondary text on tinted sections"],
    ["brand-800", "paper", "headings/stat numbers"], ["brand-700", "paper", "accent text and links"], ["brand-700", "paper-2", "accent text on tinted sections"],
    ["teal-600", "paper", "eyebrow label"], ["teal-600", "paper-2", "eyebrow label on tinted sections"], ["teal-800", "paper", "outline buttons"],
    ["success", "success-bg", "success message"], ["warning", "warning-bg", "warning message"], ["info", "info-bg", "info message"], ["danger", "danger-bg", "error message"],
    ["danger", "paper", "danger links"], ["warning", "paper", "warning text"], ["success", "paper", "success text"],
  ];
  for (const [fg, bg, use] of TEXT_PAIRS)
    it(`${fg} on ${bg} (${use}) is at least 4.5:1`, () => expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5));

  const ON_COLOR: [string, string, string][] = [
    [WHITE, "brand-700", "primary button"], [WHITE, "brand-800", "primary button hover"], [WHITE, "teal-800", "footer and secondary button"],
    [WHITE, "danger", "danger button"], [WHITE, "ink", "skip link"],
  ];
  for (const [fg, bg, use] of ON_COLOR)
    it(`white on ${bg} (${use}) is at least 4.5:1`, () => expect(contrast(fg, token(bg))).toBeGreaterThanOrEqual(4.5));

  it("focus outline and input borders meet the 3:1 non-text minimum against the page background", () => {
    expect(contrast(token("teal-600"), token("paper"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("ink-soft"), WHITE)).toBeGreaterThanOrEqual(3);      // input borders
    expect(contrast(token("brand-700"), token("paper-2"))).toBeGreaterThanOrEqual(3); // progress bar fill on its track
  });
});
