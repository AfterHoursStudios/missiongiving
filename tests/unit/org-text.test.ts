import { describe, expect, it } from "vitest";
import { orgText } from "@/lib/statements-pdf";

describe("orgText (organization wording on receipts and statements)", () => {
  it("leaves blank or still-placeholder settings off the PDF", () => {
    expect(orgText("")).toBeNull();
    expect(orgText("   ")).toBeNull();
    expect(orgText(undefined)).toBeNull();
    expect(orgText("PLACEHOLDER - pending Ultimate Mission / legal review.")).toBeNull();
    expect(orgText("[PLACEHOLDER] text")).toBeNull();
  });
  it("prints real wording as entered", () => {
    expect(orgText(" No goods or services were provided in exchange for this contribution. ")).toBe("No goods or services were provided in exchange for this contribution.");
    expect(orgText("Placeholders are not mentioned here")).toBe("Placeholders are not mentioned here");
  });
});
