import { describe, expect, it } from "vitest";
import { lastFirst } from "@/lib/donor-name";

describe("lastFirst", () => {
  it("formats people as Last, First", () => {
    expect(lastFirst("Charles", "Downing")).toBe("Downing, Charles");
    expect(lastFirst("Stan & Gloria", "Beerman")).toBe("Beerman, Stan & Gloria");
    expect(lastFirst("Becky", "St. Clair")).toBe("St. Clair, Becky");
  });
  it("shows organizations and single names as-is", () => {
    expect(lastFirst("", "Village SDA Church")).toBe("Village SDA Church");
    expect(lastFirst("Cher", "")).toBe("Cher");
    expect(lastFirst(null, null)).toBe("");
  });
});
