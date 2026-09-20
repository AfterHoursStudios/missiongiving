import "server-only";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface OrgSettings {
  legal_name: string; brand_name: string; ein: string; mailing_address: string; phone: string; website: string;
  currency: string; guest_donations_enabled: boolean; custom_amount_enabled: boolean;
  min_donation_cents: number; max_donation_cents: number; public_recognition_enabled: boolean;
  no_goods_or_services_statement: string; tax_acknowledgment: string;
  default_thank_you: string; email_sender_name: string; email_reply_to: string;
  timezone: string; recurring_amount_change_enabled: boolean;
}

const DEFAULTS: OrgSettings = {
  legal_name: "Ultimate Mission (legal name not yet configured)", brand_name: "Mission Giving", ein: "",
  mailing_address: "", phone: "", website: "", currency: "USD",
  guest_donations_enabled: false, custom_amount_enabled: true, min_donation_cents: 500, max_donation_cents: 5_000_000,
  public_recognition_enabled: false, no_goods_or_services_statement: "", tax_acknowledgment: "",
  default_thank_you: "Thank you for your generous gift.", email_sender_name: "Mission Giving", email_reply_to: "",
  timezone: "America/Los_Angeles", recurring_amount_change_enabled: true,
};

/** Settings are read with the service role because donors/anon cannot read the table directly (RLS). Only expose safe fields to clients. */
export const getOrgSettings = cache(async (): Promise<OrgSettings> => {
  const { data } = await createSupabaseAdminClient().from("organization_settings").select("key, value");
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const row of data ?? []) if (row.key in DEFAULTS) out[row.key] = row.value;
  return out as unknown as OrgSettings;
});

export async function getSetting(key: string): Promise<unknown> {
  const { data } = await createSupabaseAdminClient().from("organization_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

export async function setSetting(key: string, value: unknown, userId: string | null) {
  const { error } = await createSupabaseAdminClient()
    .from("organization_settings").upsert({ key, value, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Raw key/value map for the admin settings form. Callers must have passed requirePermission("settings.manage"). */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const { data } = await createSupabaseAdminClient().from("organization_settings").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
