import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/phone";

describe("formatPhone", () => {
  it.each([
    ["503-680-0290", "(503) 680-0290"],
    ["5036800290", "(503) 680-0290"],
    ["(503)680.0290", "(503) 680-0290"],
    ["+1 503 680 0290", "(503) 680-0290"],
    ["1-503-680-0290", "(503) 680-0290"],
    ["503-680-0290 x12", "(503) 680-0290 ext. 12"],
    ["503.680.0290 ext. 7", "(503) 680-0290 ext. 7"],
  ])("%s → %s", (input, out) => expect(formatPhone(input)).toBe(out));

  it("leaves international and incomplete numbers as entered", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("680-0290")).toBe("680-0290");
  });
  it("handles empty values", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone("  ")).toBe("");
  });
});
