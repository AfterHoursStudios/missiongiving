import { requirePermission } from "@/lib/auth/session";
import { getAllSettings } from "@/lib/settings";
import { saveSettings } from "@/lib/admin/settings-actions";
import { CheckInput, SimpleForm, TextInput } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organization settings" };

const area = "mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2";

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const s = await getAllSettings();
  const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
  const bool = (k: string, d = false) => (typeof s[k] === "boolean" ? (s[k] as boolean) : d);
  const cents = (k: string, d: number) => (((typeof s[k] === "number" ? (s[k] as number) : d) / 100).toFixed(2));

  return (
    <>
      <h1 className="text-3xl font-semibold">Organization settings</h1>
      <p className="mt-2 max-w-prose text-ink-soft">Legal wording below is shown on receipts and statements. Have it reviewed by Ultimate Mission and legal counsel before use; nothing here is legal advice.</p>
      <div className="mt-6 max-w-2xl"><SimpleForm action={saveSettings} submit="Save settings">
        <fieldset className="space-y-4"><legend className="text-2xl font-semibold">Organization</legend>
          <TextInput label="Legal organization name" name="legal_name" defaultValue={str("legal_name")} required />
          <TextInput label="Public brand name" name="brand_name" defaultValue={str("brand_name")} required />
          <TextInput label="EIN" name="ein" defaultValue={str("ein")} hint="Format 12-3456789. Printed on receipts." />
          <div><label htmlFor="addr" className="block font-semibold">Mailing address</label><textarea id="addr" name="mailing_address" rows={2} defaultValue={str("mailing_address")} className={area} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><TextInput label="Phone" name="phone" defaultValue={str("phone")} /><TextInput label="Contact email" name="contact_email" defaultValue={str("contact_email")} type="email" /></div>
          <TextInput label="Website" name="website" defaultValue={str("website")} />
          <TextInput label="Logo URL (https)" name="logo_url" defaultValue={str("logo_url")} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Facebook URL" name="social_facebook" defaultValue={str("social_facebook")} />
            <TextInput label="YouTube URL" name="social_youtube" defaultValue={str("social_youtube")} />
            <TextInput label="X / Twitter URL" name="social_twitter" defaultValue={str("social_twitter")} />
          </div>
        </fieldset>

        <fieldset className="space-y-4"><legend className="mt-8 text-2xl font-semibold">Finance and time</legend>
          <p className="text-sm">Currency: <strong>USD</strong> (other currencies are not supported yet).</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Time zone (IANA)" name="timezone" defaultValue={str("timezone") || "America/Los_Angeles"} hint="For example America/Los_Angeles. Used for statements and reports." />
            <TextInput label="Fiscal year start month (1-12)" name="fiscal_year_start_month" defaultValue={String(s.fiscal_year_start_month ?? 1)} />
          </div>
        </fieldset>

        <fieldset className="space-y-4"><legend className="mt-8 text-2xl font-semibold">Receipts and messages</legend>
          <div><label htmlFor="rl" className="block font-semibold">Receipt language</label><textarea id="rl" name="receipt_language" rows={3} defaultValue={str("receipt_language")} className={area} /></div>
          <div><label htmlFor="ta" className="block font-semibold">Tax acknowledgment language</label><textarea id="ta" name="tax_acknowledgment" rows={3} defaultValue={str("tax_acknowledgment")} className={area} /></div>
          <div><label htmlFor="ng" className="block font-semibold">&quot;No goods or services were provided&quot; statement</label><textarea id="ng" name="no_goods_or_services_statement" rows={2} defaultValue={str("no_goods_or_services_statement")} className={area} /></div>
          <div><label htmlFor="ty" className="block font-semibold">Default thank-you message</label><textarea id="ty" name="default_thank_you" rows={2} defaultValue={str("default_thank_you")} className={area} required /></div>
          <div className="grid gap-4 sm:grid-cols-2"><TextInput label="Email sender name" name="email_sender_name" defaultValue={str("email_sender_name")} required /><TextInput label="Reply-to email" name="email_reply_to" defaultValue={str("email_reply_to")} type="email" /></div>
        </fieldset>

        <fieldset className="space-y-4"><legend className="mt-8 text-2xl font-semibold">Giving rules</legend>
          <CheckInput label="Allow custom donation amounts" name="custom_amount_enabled" defaultChecked={bool("custom_amount_enabled", true)} />
          <CheckInput label="Show public donor recognition (only donors who opt in)" name="public_recognition_enabled" defaultChecked={bool("public_recognition_enabled")} />
          <CheckInput label="Let donors change their recurring amount online" name="recurring_amount_change_enabled" defaultChecked={bool("recurring_amount_change_enabled", true)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Minimum donation (USD)" name="min_donation" defaultValue={cents("min_donation_cents", 500)} required />
            <TextInput label="Maximum online donation (USD)" name="max_donation" defaultValue={cents("max_donation_cents", 5_000_000)} required />
          </div>
          <p className="text-sm text-ink-soft">Guest donations are off and cannot be enabled yet: guest checkout is not implemented, so all donors sign in.</p>
        </fieldset>

        <fieldset className="space-y-4"><legend className="mt-8 text-2xl font-semibold">Data retention</legend>
          <TextInput label="Keep financial records for (years)" name="data_retention_years" defaultValue={String(s.data_retention_years ?? 7)} hint="Recorded policy. Automatic purging is not built; confirm requirements with your accountant." />
        </fieldset>
      </SimpleForm></div>
    </>
  );
}
