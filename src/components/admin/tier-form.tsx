import { SimpleForm, CheckInput, TextInput } from "@/components/donor/forms";
import { saveTier } from "@/lib/admin/tier-actions";

export interface TierValues {
  id?: string; internal_name?: string; public_title?: string; amount_cents?: number; short_description?: string | null;
  impact_description?: string | null; confirmation_message?: string | null; email_message?: string | null; image_url?: string | null;
  allow_one_time?: boolean; allow_monthly?: boolean; allow_yearly?: boolean; general_fund?: boolean; project_id?: string | null;
  featured?: boolean; display_order?: number; active_from?: string | null; active_until?: string | null; status?: string;
}

const area = "mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2";
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

export function TierForm({ tier, projects }: { tier?: TierValues; projects: { id: string; title: string }[] }) {
  const t = tier ?? { allow_one_time: true, allow_monthly: true, allow_yearly: true, general_fund: true, status: "active", display_order: 0 };
  return (
    <SimpleForm action={saveTier} submit={tier?.id ? "Save tier" : "Create tier"}>
      {tier?.id && <input type="hidden" name="id" value={tier.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Internal name" name="internal_name" defaultValue={t.internal_name} required hint="Only staff see this." />
        <TextInput label="Public title" name="public_title" defaultValue={t.public_title} required />
      </div>
      <TextInput label="Amount (USD)" name="amount" defaultValue={t.amount_cents != null ? (t.amount_cents / 100).toFixed(2) : ""} required />
      <TextInput label="Short public description" name="short_description" defaultValue={t.short_description} hint="Shown under the amount. Only state impact that Ultimate Mission has approved." />
      <div><label htmlFor="impact" className="block font-semibold">Full impact description</label>
        <textarea id="impact" name="impact_description" rows={4} maxLength={2000} defaultValue={t.impact_description ?? ""} className={area} /></div>
      <div><label htmlFor="conf" className="block font-semibold">Confirmation-page thank-you message</label>
        <textarea id="conf" name="confirmation_message" rows={3} maxLength={2000} defaultValue={t.confirmation_message ?? ""} className={area} />
        <p className="text-sm text-ink-soft">Shown after this tier is chosen. Leave blank to use the organization default.</p></div>
      <div><label htmlFor="mail" className="block font-semibold">Confirmation email message</label>
        <textarea id="mail" name="email_message" rows={4} maxLength={4000} defaultValue={t.email_message ?? ""} className={area} />
        <p className="text-sm text-ink-soft">Replaces the general success-email body for this tier. Variables such as {"{{donor_first_name}}"} and {"{{donation_amount}}"} work. Plain text.</p></div>
      <TextInput label="Image URL (optional, https)" name="image_url" defaultValue={t.image_url} />

      <fieldset className="space-y-2"><legend className="font-semibold">Available for</legend>
        <CheckInput label="One-time gifts" name="allow_one_time" defaultChecked={t.allow_one_time} />
        <CheckInput label="Monthly gifts" name="allow_monthly" defaultChecked={t.allow_monthly} />
        <CheckInput label="Yearly gifts" name="allow_yearly" defaultChecked={t.allow_yearly} />
        <CheckInput label="General Fund" name="general_fund" defaultChecked={t.general_fund} />
      </fieldset>
      <div><label htmlFor="project" className="block font-semibold">Project-specific (optional)</label>
        <select id="project" name="project_id" defaultValue={t.project_id ?? ""} className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2">
          <option value="">Not project-specific</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      <CheckInput label="Recommended / featured" name="featured" defaultChecked={t.featured} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label htmlFor="from" className="block font-semibold">Active from</label><input id="from" type="date" name="active_from" defaultValue={day(t.active_from)} className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2" /></div>
        <div><label htmlFor="until" className="block font-semibold">Active until</label><input id="until" type="date" name="active_until" defaultValue={day(t.active_until)} className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2" /></div>
        <div><label htmlFor="order" className="block font-semibold">Display order</label><input id="order" type="number" min={0} name="display_order" defaultValue={t.display_order ?? 0} className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2" /></div>
      </div>
      <p className="text-sm text-ink-soft">Dates are interpreted as UTC midnight.</p>
      <div><label htmlFor="status" className="block font-semibold">Status</label>
        <select id="status" name="status" defaultValue={t.status ?? "active"} className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2">
          <option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></div>
    </SimpleForm>
  );
}
