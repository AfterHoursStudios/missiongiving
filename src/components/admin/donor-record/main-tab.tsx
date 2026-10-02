import Link from "next/link";
import { PlusCircle, Phone } from "lucide-react";
import { addNote, deleteDonor, setTag, updateContactPreferences, updateDonor } from "@/lib/admin/donor-actions";
import { SimpleForm, TextInput } from "@/components/donor/forms";
import { formatMoney } from "@/lib/money";
import type { GivingProfile } from "@/lib/admin/giving-profile";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";
import { DonorMainForm, InlineAction } from "./client";
import { SendEmailButton } from "@/components/admin/send-email-dialog";
import { FieldCol, FieldGrid, ReadValue, Row, Section, inputCls, linkCls } from "./ui";

export interface MainDonor {
  id: string; first_name: string; last_name: string; email: string; phone: string | null; organization_name: string | null;
  address_line1: string | null; address_line2: string | null; city: string | null; region: string | null; postal_code: string | null; country: string | null;
  status: string; public_recognition: boolean; created_at: string; updated_at: string;
  dp_id: string | null; dp_score: number | null; dp_total_given_cents: number | null; dp_gift_count: number | null;
  dp_last_gift_at: string | null; dp_last_gift_cents: number | null; dp_imported_at: string | null;
}

const STATUSES = ["active", "inactive", "lapsed", "do_not_contact"];
const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "");
const YEAR_LABEL = ["Calendar year-to-date", "Last year", "2 years ago", "3 years ago", "4 years ago", "5 years ago"];

export function MainTab({ donor, canEdit, canGift, canAudit, score, deletion, templates, tags, allTags, notes, prefs, profile, lastContact }: {
  donor: MainDonor; canEdit: boolean; canGift: boolean; canAudit: boolean;
  score: { donor_score: number; recency_score: number; frequency_score: number; monetary_score: number; gifts_24m: number; given_24m_cents: number } | null;
  /** Present only for staff allowed to delete donors: what a delete would remove. */
  deletion: { gifts: number; pledges: number; activePledges: number; hasLogin: boolean } | null;
  templates: { key: string; name: string }[] | null;
  tags: { id: string; name: string }[]; allTags: { id: string; name: string }[];
  notes: { id: string; body: string; created_at: string }[];
  prefs: { marketing_email?: boolean; project_updates?: boolean; annual_statement_email?: boolean; suppressed?: boolean } | null;
  profile: GivingProfile;
  lastContact: { at: string; type: string } | null;
}) {
  const id = donor.id;
  const dis = !canEdit;
  const noEmail = isPlaceholderEmail(donor.email);
  const toolbar = (
    <>
      {templates && <SendEmailButton donorId={id} templates={templates} className={`${linkCls} inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-ink hover:text-teal-600`} />}
      {canGift && <Link className={`${linkCls} inline-flex min-h-11 items-center gap-1.5 text-ink`} href={`/admin/virtual-terminal?donor=${id}`}><PlusCircle aria-hidden="true" size={16} />Add New Gift</Link>}
      {canEdit && <Link className={`${linkCls} inline-flex min-h-11 items-center gap-1.5 text-ink`} href={`/admin/donors/${id}?tab=contacts#log-contact`}><Phone aria-hidden="true" size={16} />Log a Contact</Link>}
    </>
  );

  return (
    <>
      <DonorMainForm action={updateDonor} formId="donor-main-form" canEdit={canEdit} toolbar={toolbar}>
        <input type="hidden" name="id" value={id} />
        <Section title="Constituent Contact Information">
          <FieldGrid>
            <FieldCol>
              <Row label="Household / Organization" htmlFor="organization_name"><input id="organization_name" name="organization_name" defaultValue={donor.organization_name ?? ""} disabled={dis} maxLength={120} className={inputCls} /></Row>
              <Row label={<><span aria-hidden="true" className="text-danger">* </span>First Name</>} htmlFor="first_name"><input id="first_name" name="first_name" defaultValue={donor.first_name} required disabled={dis} maxLength={80} className={inputCls} /></Row>
              <Row label={<><span aria-hidden="true" className="text-danger">* </span>Last Name</>} htmlFor="last_name"><input id="last_name" name="last_name" defaultValue={donor.last_name} required disabled={dis} maxLength={80} className={inputCls} /></Row>
              <Row label="Status" htmlFor="status">
                <select id="status" name="status" defaultValue={donor.status} disabled={dis} className={inputCls}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>)}
                </select>
              </Row>
              <Row label="Public recognition"><ReadValue align="left">{donor.public_recognition ? "Yes — may be named publicly" : "No — keep anonymous"}</ReadValue></Row>
            </FieldCol>
            <FieldCol>
              <Row label="Full Name"><ReadValue align="left">{donor.first_name} {donor.last_name}</ReadValue></Row>
              <Row label="Address" htmlFor="address_line1"><input id="address_line1" name="address_line1" defaultValue={donor.address_line1 ?? ""} disabled={dis} maxLength={120} autoComplete="off" className={inputCls} /></Row>
              <Row label="Address 2" htmlFor="address_line2"><input id="address_line2" name="address_line2" defaultValue={donor.address_line2 ?? ""} disabled={dis} maxLength={120} autoComplete="off" className={inputCls} /></Row>
              <Row label="City" htmlFor="city"><input id="city" name="city" defaultValue={donor.city ?? ""} disabled={dis} maxLength={80} className={inputCls} /></Row>
              <Row label="State" htmlFor="region"><input id="region" name="region" defaultValue={donor.region ?? ""} disabled={dis} maxLength={80} className={`${inputCls} max-w-32`} /></Row>
              <Row label="Zip" htmlFor="postal_code"><input id="postal_code" name="postal_code" defaultValue={donor.postal_code ?? ""} disabled={dis} maxLength={20} className={`${inputCls} max-w-40`} /></Row>
              <Row label="Country" htmlFor="country"><input id="country" name="country" defaultValue={donor.country ?? ""} disabled={dis} maxLength={2} placeholder="US" className={`${inputCls} max-w-20 uppercase`} /></Row>
            </FieldCol>
            <FieldCol>
              {noEmail
                ? <Row label="Email" htmlFor="email"><input id="email" name="email" type="email" disabled={dis} maxLength={200} placeholder="No email on file — add one" autoComplete="off" className={inputCls} /></Row>
                : <Row label="Email"><ReadValue align="left"><span className="break-all">{donor.email}</span></ReadValue></Row>}
              <Row label="Mobile Phone" htmlFor="phone"><input id="phone" name="phone" type="tel" defaultValue={donor.phone ?? ""} disabled={dis} maxLength={30} className={inputCls} /></Row>
              <Row label="Receipt Delivery"><ReadValue align="left">Email</ReadValue></Row>
              <Row label="Donor Since"><ReadValue align="left">{date(donor.created_at)}</ReadValue></Row>
              {canEdit && <p className="text-sm text-ink-soft sm:pl-[12rem]">{noEmail
                ? "Imported without an email, so no receipts or messages can be sent yet. Once saved, the email is locked like any other donor's."
                : <>Email is the donor&apos;s sign-in and receipt address, so it can&apos;t be changed here.</>}</p>}
            </FieldCol>
          </FieldGrid>
        </Section>
      </DonorMainForm>

      <Section title="Additional Information">
        <FieldGrid cols={2}>
          <div>
            <Row label="Flags">
              <ul className="min-h-24 rounded border border-ink-soft/60 p-2">
                {tags.length === 0 && <li className="text-ink-soft">No flags</li>}
                {tags.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span>{t.name}</span>
                    {canEdit && <InlineAction action={setTag} fields={{ id, op: "remove", tagId: t.id }} label="Remove" tone="danger" />}
                  </li>
                ))}
              </ul>
            </Row>
            {canEdit && (
              <details className="mt-2 sm:pl-[12rem]">
                <summary className={`${linkCls} inline-block min-h-11 cursor-pointer py-2 underline`}>Add a flag</summary>
                <div className="max-w-sm"><SimpleForm action={setTag} submit="Add flag">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="add" />
                  <label htmlFor="tagId" className="block font-semibold">Existing flag</label>
                  <select id="tagId" name="tagId" className={inputCls}><option value="">Choose…</option>{allTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                  <TextInput label="Or create a new flag" name="newTag" />
                </SimpleForm></div>
              </details>
            )}
          </div>
          <div>
            <Row label="Notes">
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded border border-ink-soft/60">
                {notes.length === 0 && <li className="p-2 text-ink-soft">No notes</li>}
                {notes.map((n) => <li key={n.id} className="p-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="text-sm text-ink-soft">{new Date(n.created_at).toLocaleString("en-US")}</p></li>)}
              </ul>
            </Row>
            {canEdit && (
              <div className="mt-3 sm:pl-[12rem]"><SimpleForm action={addNote} submit="Add note"><input type="hidden" name="id" value={id} />
                <label htmlFor="body" className="block font-semibold">New note <span className="font-normal text-ink-soft">(staff only — never record card or bank numbers)</span></label>
                <textarea id="body" name="body" rows={3} maxLength={4000} required className="w-full rounded border border-ink-soft/60 bg-white px-2.5 py-2" />
              </SimpleForm></div>
            )}
          </div>
        </FieldGrid>
      </Section>

      <Section title="Contact Preferences">
        {canEdit ? (
          <SimpleForm action={updateContactPreferences} submit="Save preferences">
            <input type="hidden" name="id" value={id} />
            <FieldGrid>
              <FieldCol>
                <PrefCheck name="marketing_email" label="News emails" on={!!prefs?.marketing_email} />
                <PrefCheck name="project_updates" label="Project updates" on={!!prefs?.project_updates} />
              </FieldCol>
              <FieldCol>
                <PrefCheck name="annual_statement_email" label="Annual statement email" on={prefs?.annual_statement_email ?? true} />
                <PrefCheck name="suppressed" label="Email suppressed" on={!!prefs?.suppressed} hint="blocks all campaign email" />
              </FieldCol>
              <FieldCol>
                <Check label="Do not contact" on={donor.status === "do_not_contact"} hint="set with Status above" />
              </FieldCol>
            </FieldGrid>
          </SimpleForm>
        ) : (
          <FieldGrid>
            <FieldCol>
              <Check label="News emails" on={!!prefs?.marketing_email} />
              <Check label="Project updates" on={!!prefs?.project_updates} />
            </FieldCol>
            <FieldCol>
              <Check label="Annual statement email" on={prefs?.annual_statement_email ?? true} />
              <Check label="Email suppressed" on={!!prefs?.suppressed} hint="after a bounce or spam complaint" />
            </FieldCol>
            <FieldCol>
              <Check label="Do not contact" on={donor.status === "do_not_contact"} hint="set with Status above" />
            </FieldCol>
          </FieldGrid>
        )}
        <p className="mt-3 text-sm text-ink-soft">Donors can also change these from their own account. Receipts are always sent regardless of these choices. Unticking &ldquo;Email suppressed&rdquo; clears a bounce or a staff block, but never a donor&apos;s own unsubscribe or spam complaint.</p>
      </Section>

      {score && (
        <Section title="Donor Score" extra={<span className="text-sm text-ink-soft">Recency 40% · Frequency 30% · Monetary 30% · last 24 months</span>}>
          <FieldGrid>
            <FieldCol>
              <Row label="Donor Score"><ReadValue><span className="font-bold">{score.donor_score}</span> / 100</ReadValue></Row>
            </FieldCol>
            <FieldCol>
              <Row label="Recency (40%)"><ReadValue>{Math.round(score.recency_score)}</ReadValue></Row>
              <Row label="Frequency (30%)"><ReadValue>{Math.round(score.frequency_score)}</ReadValue></Row>
              <Row label="Monetary (30%)"><ReadValue>{Math.round(score.monetary_score)}</ReadValue></Row>
            </FieldCol>
            <FieldCol>
              <Row label="Gifts, last 24 months"><ReadValue>{score.gifts_24m}</ReadValue></Row>
              <Row label="Given, last 24 months"><ReadValue>{formatMoney(score.given_24m_cents)}</ReadValue></Row>
            </FieldCol>
          </FieldGrid>
          <p className="mt-3 text-sm text-ink-soft">Recency counts down from 100 to 0 over two years since the last gift (including DonorPerfect history). Frequency and Monetary rank this donor&apos;s gifts made here in the last 24 months against every other donor who gave in that time (0–100). Score = 0.4 × Recency + 0.3 × Frequency + 0.3 × Monetary.</p>
        </Section>
      )}

      <Section title="Giving & Engagement Profile">
        <FieldGrid>
          <FieldCol>
            {profile.byYear.map((y, i) => <Row key={y.year} label={`${YEAR_LABEL[i]} (${y.year})`}><ReadValue>{formatMoney(y.cents)}</ReadValue></Row>)}
          </FieldCol>
          <FieldCol>
            <Row label="Lifetime Gift Total"><ReadValue>{formatMoney(profile.lifetimeCents)}</ReadValue></Row>
            <Row label="Number of Gifts"><ReadValue>{profile.giftCount}</ReadValue></Row>
            <Row label="Number of Years Donated"><ReadValue>{profile.yearsDonated}</ReadValue></Row>
            <Row label="Average Gift Amount"><ReadValue>{formatMoney(profile.averageCents)}</ReadValue></Row>
          </FieldCol>
          <FieldCol>
            <Row label="Last Gift Date"><ReadValue align="left">{date(profile.last?.at)}</ReadValue></Row>
            <Row label="Last Gift Amount"><ReadValue>{profile.last ? formatMoney(profile.last.cents) : ""}</ReadValue></Row>
            <Row label="Initial Gift Date"><ReadValue align="left">{date(profile.first?.at)}</ReadValue></Row>
            <Row label="Initial Gift Amount"><ReadValue>{profile.first ? formatMoney(profile.first.cents) : ""}</ReadValue></Row>
            <Row label="Largest Gift Date"><ReadValue align="left">{date(profile.largest?.at)}</ReadValue></Row>
            <Row label="Largest Gift Amount"><ReadValue>{profile.largest ? formatMoney(profile.largest.cents) : ""}</ReadValue></Row>
            <Row label="Last Contact Date"><ReadValue align="left">{date(lastContact?.at)}</ReadValue></Row>
            <Row label="Last Contact Type"><ReadValue align="left">{lastContact?.type ?? ""}</ReadValue></Row>
          </FieldCol>
        </FieldGrid>
      </Section>

      {donor.dp_id && (
        <Section title="DonorPerfect History" extra={<span className="text-sm text-ink-soft">giving before Mission Giving · not included in reports or totals above</span>}>
          <FieldGrid>
            <FieldCol>
              <Row label="DonorPerfect ID"><ReadValue>{donor.dp_id}</ReadValue></Row>
              <Row label="DonorPerfect Score"><ReadValue>{donor.dp_score ?? ""}</ReadValue></Row>
            </FieldCol>
            <FieldCol>
              <Row label="Total Given"><ReadValue>{formatMoney(donor.dp_total_given_cents ?? 0)}</ReadValue></Row>
              <Row label="Number of Gifts"><ReadValue>{donor.dp_gift_count ?? 0}</ReadValue></Row>
            </FieldCol>
            <FieldCol>
              <Row label="Last Gift Date"><ReadValue align="left">{donor.dp_last_gift_at ? date(`${donor.dp_last_gift_at}T12:00:00`) : ""}</ReadValue></Row>
              <Row label="Last Gift Amount"><ReadValue>{donor.dp_last_gift_cents != null ? formatMoney(donor.dp_last_gift_cents) : ""}</ReadValue></Row>
              <Row label="Imported"><ReadValue align="left">{date(donor.dp_imported_at)}</ReadValue></Row>
            </FieldCol>
          </FieldGrid>
        </Section>
      )}

      <Section title="Audit Information" defaultOpen={false}>
        <FieldGrid>
          <Row label="Record created"><ReadValue align="left">{new Date(donor.created_at).toLocaleString("en-US")}</ReadValue></Row>
          <Row label="Last updated"><ReadValue align="left">{new Date(donor.updated_at).toLocaleString("en-US")}</ReadValue></Row>
          <Row label="Record ID"><ReadValue align="left"><span className="break-all text-sm">{donor.id}</span></ReadValue></Row>
        </FieldGrid>
        {canAudit && <p className="mt-3 text-sm"><Link className={linkCls} href={`/admin/audit?entity=${donor.id}`}>View change history in the audit log</Link></p>}
      </Section>

      {deletion && (
        <Section title="Delete Donor" defaultOpen={false}>
          <div className="max-w-2xl rounded-md border-2 border-danger p-4">
            <p className="font-bold text-danger">This permanently deletes {donor.first_name} {donor.last_name} and cannot be undone.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>{deletion.gifts} gift{deletion.gifts === 1 ? "" : "s"} with their receipts and refunds, and {deletion.pledges} recurring gift{deletion.pledges === 1 ? "" : "s"}.</li>
              {deletion.activePledges > 0 && <li><span className="font-semibold">{deletion.activePledges} active recurring gift{deletion.activePledges === 1 ? " is" : "s are"} canceled in Stripe</span>, so the donor is not charged again.</li>}
              <li>Saved cards and bank accounts, notes, flags, communications and to-dos.</li>
              {deletion.hasLogin && <li>Their donor sign-in account (a staff login is kept).</li>}
            </ul>
            <p className="mt-2 text-sm text-ink-soft">Project totals and reports will no longer include these gifts. Keep your own copy of any record you need for taxes or accounting before deleting. To remove only personal details and keep the gift history, use a privacy request instead.</p>
            <div className="mt-4 max-w-xs"><SimpleForm action={deleteDonor} submit="Delete donor permanently" tone="danger">
              <input type="hidden" name="id" value={id} />
              <TextInput label="Type DELETE to confirm" name="confirm" required />
            </SimpleForm></div>
          </div>
        </Section>
      )}
    </>
  );
}

/** An editable preference checkbox, laid out like the read-only rows. */
function PrefCheck({ name, label, on, hint }: { name: string; label: string; on: boolean; hint?: string }) {
  return (
    <Row label={label} htmlFor={`pref-${name}`}>
      <span className="inline-flex items-center gap-2">
        <input id={`pref-${name}`} type="checkbox" name={name} defaultChecked={on} className="size-4" />
        {hint && <span className="text-sm text-ink-soft">{hint}</span>}
      </span>
    </Row>
  );
}

function Check({ label, on, hint }: { label: string; on: boolean; hint?: string }) {
  return (
    <Row label={label}>
      <span className="inline-flex items-center gap-2">
        <input type="checkbox" checked={on} disabled readOnly aria-label={label} className="size-4" />
        {hint && <span className="text-sm text-ink-soft">{hint}</span>}
      </span>
    </Row>
  );
}
