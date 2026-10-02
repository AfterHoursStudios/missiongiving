import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createDonor } from "@/lib/admin/donor-actions";
import { SimpleForm, TextInput } from "@/components/donor/forms";

export const metadata = { title: "Add donor" };

export default async function NewDonorPage() {
  await requirePermission("donors.edit");
  return (
    <>
      <p><Link className="underline" href="/admin/donors">← All donors</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">Add donor</h1>
      <p className="text-sm text-ink-soft">For a donor who has not given online yet — a phone pledge, a paper form, a household contact.</p>
      <div className="mt-6 max-w-xl">
        <SimpleForm action={createDonor} submit="Add donor">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="First name" name="first_name" required />
            <TextInput label="Last name" name="last_name" required />
          </div>
          <TextInput label="Email" name="email" type="email" required />
          <TextInput label="Phone" name="phone" />
          <TextInput label="Household or organization" name="organization_name" />
          <TextInput label="Address line 1" name="address_line1" />
          <TextInput label="Address line 2" name="address_line2" />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="City" name="city" />
            <TextInput label="State/Region" name="region" />
            <TextInput label="Postal code" name="postal_code" />
          </div>
        </SimpleForm>
      </div>
    </>
  );
}
