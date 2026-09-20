import { describe, expect, it } from "vitest";
import { renderReceiptPdf, type ReceiptData } from "@/lib/receipts/pdf";

const data = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  receiptNumber: "MG-00001000", isFinal: true, status: "Succeeded", donorName: "Sample Donor", date: "1/2/2026",
  amountCents: 5000, currency: "USD", designation: "General Fund", paymentMethod: "card", frequency: "one time",
  org: { legalName: "Sample Org", address: "1 Main St", ein: "00-0000000", phone: "555-0100", acknowledgment: "Thanks.", noGoods: "No goods or services provided." },
  ...over,
});

describe("renderReceiptPdf", () => {
  it("renders a valid PDF for final and pending receipts", async () => {
    for (const isFinal of [true, false]) {
      const buf = await renderReceiptPdf(data({ isFinal, status: isFinal ? "Succeeded" : "Processing", paymentMethod: "us_bank_account" }));
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(800);
    }
  });
});
