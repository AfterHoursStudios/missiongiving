import { describe, expect, it } from "vitest";
import { settingsSchema, settingsToEntries } from "@/lib/admin/settings-schema";

const valid = {
  legal_name: "Sample Org", brand_name: "Mission Giving", ein: "", mailing_address: "", phone: "", contact_email: "", website: "", logo_url: "",
  timezone: "America/Los_Angeles", fiscal_year_start_month: "1", receipt_language: "", tax_acknowledgment: "", no_goods_or_services_statement: "",
  default_thank_you: "Thanks", social_facebook: "", social_youtube: "", social_twitter: "", min_donation: "5", max_donation: "50000",
  email_sender_name: "Mission Giving", email_reply_to: "", data_retention_years: "7",
};

describe("settingsSchema", () => {
  it("accepts valid input, converts dollars to cents and pins USD", () => {
    const e = settingsToEntries(settingsSchema.parse({ ...valid, custom_amount_enabled: "on" }));
    expect(e).toMatchObject({ min_donation_cents: 500, max_donation_cents: 5_000_000, currency: "USD", custom_amount_enabled: true, public_recognition_enabled: false, fiscal_year_start_month: 1 });
    expect(e).not.toHaveProperty("min_donation");
  });
  it("normalizes and validates the EIN", () => {
    expect(settingsSchema.parse({ ...valid, ein: "123456789" }).ein).toBe("12-3456789");
    expect(settingsSchema.safeParse({ ...valid, ein: "12-34" }).success).toBe(false);
  });
  it("validates urls, emails, zones, months and limits", () => {
    expect(settingsSchema.safeParse({ ...valid, website: "http://x.test" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, logo_url: "javascript:alert(1)" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, email_reply_to: "nope" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, timezone: "Mars/Base" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, fiscal_year_start_month: "13" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, min_donation: "0.50" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, min_donation: "100", max_donation: "50" }).success).toBe(false);
  });
  it("can switch on guest donations, but never another currency", () => {
    const e = settingsToEntries(settingsSchema.parse({ ...valid, guest_donations_enabled: "on", currency: "EUR" }));
    expect(e.guest_donations_enabled).toBe(true);
    expect(e.currency).toBe("USD");
  });
});
