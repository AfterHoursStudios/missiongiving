import { getDonorContext } from "@/lib/donor/context";
import { changePassword, requestAccountDeletion, updatePreferences, updateProfile } from "@/lib/donor/actions";
import { CheckInput, SimpleForm, TextInput } from "@/components/donor/forms";
import { Empty, Panel } from "@/components/donor/ui";
import { getOrgSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile and preferences" };

export default async function ProfilePage() {
  const { supabase, donor, user } = await getDonorContext();
  const settings = await getOrgSettings();
  if (!donor) {
    return (
      <>
        <h1 className="text-3xl font-semibold">Profile</h1>
        <div className="mt-6"><Empty title="Your profile is created with your first gift" /></div>
        <Panel className="mt-6 max-w-md" title="Password" id="pw"><PasswordForm /></Panel>
      </>
    );
  }
  const { data: prefs } = await supabase.from("communication_preferences")
    .select("marketing_email, project_updates, annual_statement_email").eq("donor_id", donor.id).maybeSingle();

  return (
    <>
      <h1 className="text-3xl font-semibold">Profile and preferences</h1>
      <p className="mt-1 text-ink-soft">Signed in as {user.email}</p>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Contact information" id="contact">
          <SimpleForm action={updateProfile} submit="Save profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="First name" name="first_name" defaultValue={donor.first_name} autoComplete="given-name" required />
              <TextInput label="Last name" name="last_name" defaultValue={donor.last_name} autoComplete="family-name" required />
            </div>
            <TextInput label="Phone (optional)" name="phone" defaultValue={donor.phone} autoComplete="tel" />
            <TextInput label="Address line 1" name="address_line1" defaultValue={donor.address_line1} autoComplete="address-line1" />
            <TextInput label="Address line 2" name="address_line2" defaultValue={donor.address_line2} autoComplete="address-line2" />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextInput label="City" name="city" defaultValue={donor.city} autoComplete="address-level2" />
              <TextInput label="State/Region" name="region" defaultValue={donor.region} autoComplete="address-level1" />
              <TextInput label="Postal code" name="postal_code" defaultValue={donor.postal_code} autoComplete="postal-code" />
            </div>
            {settings.public_recognition_enabled
              ? <CheckInput label="My name may appear in public donor recognition" name="public_recognition" defaultChecked={donor.public_recognition} />
              : <p className="text-sm text-ink-soft">Public donor recognition is currently turned off. Your name is not shown publicly.</p>}
          </SimpleForm>
        </Panel>

        <div className="space-y-6">
          <Panel title="Email preferences" id="prefs">
            <SimpleForm action={updatePreferences} submit="Save preferences">
              <CheckInput label="News and appreciation from Ultimate Mission" name="marketing_email" defaultChecked={prefs?.marketing_email ?? false} />
              <CheckInput label="Updates on projects I support" name="project_updates" defaultChecked={prefs?.project_updates ?? false} />
              <CheckInput label="Email me when my annual statement is ready" name="annual_statement_email" defaultChecked={prefs?.annual_statement_email ?? true} />
              <p className="text-sm text-ink-soft">Gift receipts and payment notices are always sent; they are not marketing.</p>
            </SimpleForm>
          </Panel>

          <Panel title="Password" id="pw"><PasswordForm /></Panel>

          <Panel title="Your data" id="data">
            <p><a className="font-semibold text-teal-600 underline" href="/dashboard/export">Download a copy of my personal data (JSON)</a></p>
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold text-danger underline">Request account deletion</summary>
              <div className="mt-3 rounded-md border border-danger p-4">
                <p className="text-sm">Staff will review your request. Records we must keep for financial and tax purposes (gift amounts, dates and receipts) are retained, but your name, contact details and preferences are removed. Recurring gifts should be canceled first.</p>
                <div className="mt-4">
                  <SimpleForm action={requestAccountDeletion} submit="Submit deletion request" tone="danger">
                    <TextInput label='Type DELETE to confirm' name="confirm" />
                  </SimpleForm>
                </div>
              </div>
            </details>
          </Panel>
        </div>
      </div>
    </>
  );
}

function PasswordForm() {
  return (
    <SimpleForm action={changePassword} submit="Change password">
      <TextInput label="New password" name="password" type="password" autoComplete="new-password" required
        hint="At least 12 characters with upper case, lower case and a number." />
    </SimpleForm>
  );
}
