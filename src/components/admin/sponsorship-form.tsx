import { CheckInput, SimpleForm, TextInput } from "@/components/donor/forms";
import { CountedTextarea } from "./counted-textarea";
import { saveSponsorship } from "@/lib/admin/sponsorship-actions";
import { SPONSOR_DESCRIPTION_MAX } from "@/lib/admin/sponsorship-schema";

export interface SponsorshipValues {
  id?: string; name?: string; country?: string | null; description?: string | null; photo_url?: string | null;
  monthly_amount_cents?: number; status?: string; display_order?: number;
}
const sel = "mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2";

export function SponsorshipForm({ s }: { s?: SponsorshipValues }) {
  return (
    <SimpleForm action={saveSponsorship} submit={s?.id ? "Save sponsorship" : "Create sponsorship"}>
      {s?.id && <input type="hidden" name="id" value={s.id} />}
      <TextInput label="Name" name="name" defaultValue={s?.name} required />
      <TextInput label="Country" name="country" defaultValue={s?.country} />
      <CountedTextarea id="description" name="description" label="Description" max={SPONSOR_DESCRIPTION_MAX} rows={6} defaultValue={s?.description ?? ""} hint="Shown on her card. Line breaks are kept." />
      <TextInput label="Monthly sponsorship amount (USD)" name="amount" defaultValue={s?.monthly_amount_cents ? (s.monthly_amount_cents / 100).toFixed(2) : ""} required hint="Between $5 and $1,000. Donors give this amount monthly, or once." />
      <div>
        <label htmlFor="photo" className="block font-semibold">Photo</label>
        {s?.photo_url && (<div className="mt-2 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.photo_url} alt={`Current photo of ${s.name ?? "her"}`} className="size-24 rounded-full object-cover" />
          <CheckInput label="Remove photo" name="remove_photo" />
        </div>)}
        <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1.5 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-teal-800 file:px-4 file:font-semibold file:text-white" />
        <p className="text-sm text-ink-soft">JPEG, PNG or WebP, up to 8 MB. Shown as a circle. Use a photo she has consented to share.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="status" className="block font-semibold">Status</label>
          <select id="status" name="status" defaultValue={s?.status ?? "active"} className={sel}><option value="active">Active (shown on the site)</option><option value="inactive">Inactive (hidden)</option><option value="archived">Archived</option></select></div>
        <TextInput label="Display order" name="display_order" defaultValue={String(s?.display_order ?? 0)} hint="Lower numbers appear first." />
      </div>
    </SimpleForm>
  );
}
