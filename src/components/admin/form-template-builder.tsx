"use client";

import { useActionState, useState } from "react";
import { saveFormTemplate, uploadFormBlockImage } from "@/lib/admin/form-template-actions";
import { Feedback, Button } from "@/components/donor/forms";
import { DonateFlow, type FlowConfig } from "@/components/donate/donate-flow";
import { BLOCK_LABELS, type FormBlock, type FormTemplateInput } from "@/lib/admin/form-template-schema";

const BLOCK_TYPES: FormBlock["type"][] = ["headline", "section_header", "description", "image"];

// A realistic but fake amount catalog so the live preview always has something to show, independent of any real
// project's tiers. Only presentation is being edited here — amounts and payment stay whatever the assigned project uses.
const PREVIEW_CONFIG: FlowConfig = {
  tiers: [
    { id: "p1", public_title: "", amount_cents: 2500, short_description: null, featured: false, allow_one_time: true, allow_monthly: true, allow_yearly: true, general_fund: true, project_id: null },
    { id: "p2", public_title: "", amount_cents: 5000, short_description: "Most popular", featured: true, allow_one_time: true, allow_monthly: true, allow_yearly: true, general_fund: true, project_id: null },
    { id: "p3", public_title: "", amount_cents: 10000, short_description: null, featured: false, allow_one_time: true, allow_monthly: true, allow_yearly: true, general_fund: true, project_id: null },
  ],
  projects: [], customEnabled: true, minCents: 500, maxCents: 100000, publishableKey: null,
  defaults: { firstName: "Jamie", lastName: "Donor" }, initialFrequency: "one_time", initialProjectId: null, sponsorship: null,
  signedInEmail: null, // preview as a guest, since that's who most donors are
};

function newBlock(type: FormBlock["type"]): FormBlock {
  return type === "image" ? { type, url: "", alt: "" } : { type, text: "" };
}

export function FormTemplateBuilder({ id, initial }: { id?: string; initial: FormTemplateInput }) {
  const [state, formAction, pending] = useActionState(saveFormTemplate, undefined);
  const [t, setT] = useState<FormTemplateInput>(initial);
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [uploadError, setUploadError] = useState<Record<number, string | undefined>>({});
  const set = <K extends keyof FormTemplateInput>(key: K, value: FormTemplateInput[K]) => setT((p) => ({ ...p, [key]: value }));

  const addBlock = (type: FormBlock["type"]) => setT((p) => ({ ...p, blocks: [...p.blocks, newBlock(type)] }));
  const removeBlock = (i: number) => setT((p) => ({ ...p, blocks: p.blocks.filter((_, idx) => idx !== i) }));
  const moveBlock = (i: number, dir: -1 | 1) => setT((p) => {
    const j = i + dir;
    if (j < 0 || j >= p.blocks.length) return p;
    const blocks = [...p.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    return { ...p, blocks };
  });
  const updateBlock = (i: number, patch: Record<string, string>) => setT((p) => ({ ...p, blocks: p.blocks.map((b, idx) => (idx === i ? { ...b, ...patch } as FormBlock : b)) }));

  async function handleImageFile(i: number, file: File | undefined) {
    if (!file) return;
    setUploadError((e) => ({ ...e, [i]: undefined }));
    setUploading((u) => ({ ...u, [i]: true }));
    const res = await uploadFormBlockImage(file);
    setUploading((u) => ({ ...u, [i]: false }));
    if (!res.ok) { setUploadError((e) => ({ ...e, [i]: res.error })); return; }
    updateBlock(i, { url: res.url });
  }
  const anyUploading = Object.values(uploading).some(Boolean);

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <form action={formAction} className="space-y-6">
        {id && <input type="hidden" name="id" value={id} />}
        <input type="hidden" name="blocks" value={JSON.stringify(t.blocks)} />

        <div>
          <label htmlFor="ft-name" className="block font-semibold">Form name</label>
          <input id="ft-name" name="name" value={t.name} onChange={(e) => set("name", e.target.value)} required
            className="mt-1.5 min-h-11 w-full rounded-md border border-ink-soft bg-white px-3" />
          <p className="mt-1 text-sm text-ink-soft">For your reference only; donors never see this name.</p>
        </div>

        <div>
          <label htmlFor="ft-status" className="block font-semibold">Status</label>
          <select id="ft-status" name="status" value={t.status} onChange={(e) => set("status", e.target.value as FormTemplateInput["status"])}
            className="mt-1.5 min-h-11 w-full rounded-md border border-ink-soft bg-white px-2">
            <option value="active">Active (can be assigned to a project or campaign)</option>
            <option value="archived">Archived (hidden, kept for history)</option>
          </select>
        </div>

        <fieldset className="grid grid-cols-2 gap-4">
          <legend className="mb-1 font-semibold">Colors</legend>
          <div>
            <label htmlFor="ft-bg" className="block text-sm font-semibold">Page background</label>
            <input id="ft-bg" name="background_color" type="color" value={t.background_color} onChange={(e) => set("background_color", e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-ink-soft" />
          </div>
          <div>
            <label htmlFor="ft-accent" className="block text-sm font-semibold">Accent (buttons, progress)</label>
            <input id="ft-accent" name="accent_color" type="color" value={t.accent_color} onChange={(e) => set("accent_color", e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-ink-soft" />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold">Content blocks</legend>
          <p className="text-sm text-ink-soft">Shown once at the top of the form, above the giving steps.</p>
          {t.blocks.map((b, i) => (
            <div key={i} className="rounded-md border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink-soft">{BLOCK_LABELS[b.type]}</span>
                <div className="flex gap-3">
                  <button type="button" onClick={() => moveBlock(i, -1)} disabled={i === 0} className="min-h-8 text-sm font-semibold underline disabled:opacity-30">Move up</button>
                  <button type="button" onClick={() => moveBlock(i, 1)} disabled={i === t.blocks.length - 1} className="min-h-8 text-sm font-semibold underline disabled:opacity-30">Move down</button>
                  <button type="button" onClick={() => removeBlock(i)} className="min-h-8 text-sm font-semibold text-danger underline">Remove</button>
                </div>
              </div>
              {b.type === "image" ? (
                <div className="mt-2 space-y-2">
                  {b.url ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.url} alt={b.alt || ""} className="h-20 w-32 rounded-md border border-line object-cover" />
                      <label className="min-h-9 cursor-pointer text-sm font-semibold text-teal-800 underline">
                        {uploading[i] ? "Uploading…" : "Replace photo"}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading[i]}
                          onChange={(e) => handleImageFile(i, e.target.files?.[0])} />
                      </label>
                    </div>
                  ) : (
                    <div>
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading[i]} onChange={(e) => handleImageFile(i, e.target.files?.[0])}
                        className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-teal-800 file:px-4 file:font-semibold file:text-white" />
                      {uploading[i] && <p className="mt-1 text-sm text-ink-soft">Uploading…</p>}
                    </div>
                  )}
                  {uploadError[i] && <p className="text-sm text-danger">{uploadError[i]}</p>}
                  <input value={b.alt ?? ""} onChange={(e) => updateBlock(i, { alt: e.target.value })} placeholder="Alt text (describe the photo)"
                    className="min-h-11 w-full rounded-md border border-ink-soft bg-white px-3" />
                  <p className="text-sm text-ink-soft">JPEG, PNG or WebP, up to 8 MB. Location data is removed automatically.</p>
                </div>
              ) : (
                <textarea value={b.text} onChange={(e) => updateBlock(i, { text: e.target.value })} rows={b.type === "description" ? 3 : 1}
                  className="mt-2 w-full rounded-md border border-ink-soft bg-white px-3 py-2" />
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {BLOCK_TYPES.map((type) => (
              <button key={type} type="button" onClick={() => addBlock(type)}
                className="min-h-9 rounded-md border border-teal-800 px-3 text-sm font-semibold text-teal-800 hover:bg-info-bg">+ {BLOCK_LABELS[type]}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">Giving frequencies offered</legend>
          <Toggle name="allow_one_time" label="One time" checked={t.allow_one_time} onChange={(v) => set("allow_one_time", v)} />
          <Toggle name="allow_monthly" label="Monthly" checked={t.allow_monthly} onChange={(v) => set("allow_monthly", v)} />
          <Toggle name="allow_yearly" label="Yearly" checked={t.allow_yearly} onChange={(v) => set("allow_yearly", v)} />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">Donor fields to collect</legend>
          <Toggle name="show_phone" label="Phone number" checked={t.show_phone} onChange={(v) => set("show_phone", v)} />
          <Toggle name="show_address" label="Mailing address" checked={t.show_address} onChange={(v) => set("show_address", v)} />
          <Toggle name="show_organization" label="Business/organization option" checked={t.show_organization} onChange={(v) => set("show_organization", v)} />
          <Toggle name="show_dedication" label="Dedicate this gift" checked={t.show_dedication} onChange={(v) => set("show_dedication", v)} />
        </fieldset>

        <div>
          <label htmlFor="ft-submit" className="block font-semibold">Final button label</label>
          <input id="ft-submit" name="submit_label" value={t.submit_label} onChange={(e) => set("submit_label", e.target.value)} required
            className="mt-1.5 min-h-11 w-full rounded-md border border-ink-soft bg-white px-3" />
        </div>

        <div className="flex items-center gap-4">
          <Button pending={pending || anyUploading}>{id ? "Save form" : "Create form"}</Button>
        </div>
        <Feedback state={state} />
      </form>

      <div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">Live preview</p>
        <div className="rounded-lg border border-line bg-paper-2 p-4">
          <DonateFlow config={PREVIEW_CONFIG} template={t} previewOnly />
        </div>
      </div>
    </div>
  );
}

function Toggle({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3">
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5" />
      <span>{label}</span>
    </label>
  );
}
