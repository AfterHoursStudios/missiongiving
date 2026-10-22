import { describe, expect, it } from "vitest";
import { GL_TO_PROJECT, columnOf, dpCents, dpDate, dpFrequency, parseCsv } from "@/lib/admin/dp-csv";

describe("DonorPerfect CSV helpers", () => {
  it("parses quoted fields, doubled quotes, CRLF and a byte-order mark", () => {
    expect(parseCsv('﻿GIFT_ID,NOTE\r\n1,"Thanks, ""Ann"""\r\n\r\n2,plain\r\n')).toEqual([["GIFT_ID", "NOTE"], ["1", 'Thanks, "Ann"'], ["2", "plain"]]);
  });
  it("finds columns by DonorPerfect field name", () => {
    expect(columnOf([" donor_id ", "GIFT_ID"], "DONOR_ID")).toBe(0);
    expect(() => columnOf(["A"], "PLINK")).toThrow(/PLINK not found/);
  });
  it("reads DonorPerfect dates and money", () => {
    expect(dpDate("1/5/2026")).toBe("2026-01-05");
    expect(dpDate("")).toBeNull();
    expect(dpCents("$23,970.00")).toBe(2397000);
    expect(dpCents("-$6.99")).toBe(-699);
    expect(dpCents("($6.99)")).toBe(-699);
    expect(dpCents("")).toBeNaN();
  });
  it("maps pledge frequencies, including bi-weekly and irregular schedules", () => {
    expect([dpFrequency("M"), dpFrequency("A"), dpFrequency("BW"), dpFrequency("U"), dpFrequency("")]).toEqual(["monthly", "yearly", "biweekly", "irregular", "monthly"]);
  });
  it("sends unrestricted and blank General Ledger codes to the General Fund", () => {
    expect(GL_TO_PROJECT.UN).toBeNull();
    expect(GL_TO_PROJECT[""]).toBeNull();
    expect(GL_TO_PROJECT.RECURINGSPONSOR).toBe("Sponsorship (DonorPerfect)");
  });
});

describe("monthly equivalent of a recurring gift", () => {
  it("counts bi-weekly as 26 a year, irregular like monthly, and leaves yearly out", async () => {
    const { monthlyEquivalentCents } = await import("@/lib/donations/frequency");
    expect(monthlyEquivalentCents(1000, "monthly")).toBe(1000);
    expect(monthlyEquivalentCents(1000, "biweekly")).toBe(2167);
    expect(monthlyEquivalentCents(1000, "irregular")).toBe(1000);
    expect(monthlyEquivalentCents(12000, "yearly")).toBe(0);
  });
});
