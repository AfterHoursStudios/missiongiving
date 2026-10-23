"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Heading, Image as ImageIcon, LayoutPanelLeft, Minus, MousePointerClick,
  MoveVertical, Monitor, Save, Send, Smartphone, Text as TextIcon, Trash2,
} from "lucide-react";
import { uploadEmailImage } from "@/lib/admin/email-images";
import { saveNewsletter, sendNewsletterTest } from "@/lib/comms/newsletter-actions";
import {
  ACCENTS, BLOCK_LABELS, newBlock, newBlockId, renderNewsletterHtml, type BlockType, type NewsletterBlock, type NewsletterDesign,
} from "@/lib/comms/newsletter";
import { TEMPLATE_VARIABLES } from "@/lib/template-variables";
import { EmailEditor } from "./email-editor";

const input = "mt-1 min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";
const iconBtn = "inline-flex size-9 items-center justify-center rounded-md text-ink-soft hover:bg-paper-2 hover:text-ink disabled:opacity-30";
const btn = "inline-flex min-h-11 items-center gap-2 rounded-md px-4 font-semibold disabled:opacity-60";

const ICONS: Record<BlockType, typeof TextIcon> = {
  heading: Heading, text: TextIcon, image: ImageIcon, button: MousePointerClick, story: LayoutPanelLeft, divider: Minus, spacer: MoveVertical,
};

export interface ProjectChoice { title: string; summary: string; image: string; url: string }

/** Preview values for merge fields (the real send fills each donor's own). */
const SAMPLE: Record<string, string> = { donor_first_name: "Sample", donor_full_name: "Sample Donor", organization_name: "Mission Giving" };
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s: string, html: boolean) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, n: string) => {
  const v = SAMPLE[n] ?? ((TEMPLATE_VARIABLES as readonly string[]).includes(n) ? `[${n.replace(/_/g, " ")}]` : "");
  return html ? escape(v) : v;
});

/**
 * Newsletter builder: masthead settings, a list of blocks (heading, text, picture, button, story, divider, space) that
 * can be added, edited, reordered, copied and removed, and a live preview of the email at desktop or phone width.
 */
export function NewsletterBuilder({ id, initialSubject, initialDesign, orgName, orgAddress, logoUrl, projects }: {
  id: string; initialSubject: string; initialDesign: NewsletterDesign; orgName: string; orgAddress: string; logoUrl: string; projects: ProjectChoice[];
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [design, setDesign] = useState<NewsletterDesign>(initialDesign);
  const [open, setOpen] = useState<string | null>(initialDesign.blocks[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  const change = (patch: Partial<NewsletterDesign>) => { setDesign((d) => ({ ...d, ...patch })); setDirty(true); setNotice(null); };
  const setBlock = (bid: string, patch: Partial<NewsletterBlock>) => change({ blocks: design.blocks.map((b) => (b.id === bid ? ({ ...b, ...patch } as NewsletterBlock) : b)) });
  const move = (i: number, by: number) => { const b = [...design.blocks]; [b[i], b[i + by]] = [b[i + by], b[i]]; change({ blocks: b }); };
  const add = (block: NewsletterBlock) => { change({ blocks: [...design.blocks, block] }); setOpen(block.id); };
  const copy = (i: number) => { const b = [...design.blocks]; const c = { ...b[i], id: newBlockId() } as NewsletterBlock; b.splice(i + 1, 0, c); change({ blocks: b }); setOpen(c.id); };
  const remove = (i: number) => change({ blocks: design.blocks.filter((_, j) => j !== i) });

  const save = () => startSave(async () => {
    const r = await saveNewsletter({ id, subject, design });
    setNotice(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    if (r.ok) setDirty(false);
  });
  const test = () => startTest(async () => {
    if (dirty) { const s = await saveNewsletter({ id, subject, design }); if (!s.ok) return setNotice({ ok: false, text: s.error }); setDirty(false); }
    const r = await sendNewsletterTest(id);
    setNotice(r.ok ? { ok: true, text: r.message.replace(" Save first if you have changes.", "") } : { ok: false, text: r.error });
  });

  const preview = useMemo(() => renderNewsletterHtml(design, subject, {
    orgName, orgAddress: orgAddress || "[mailing address]", logoUrl, fillText: (s) => fill(s, false), clean: (h) => fill(h, true),
    unsubscribeUrl: "https://example.org/unsubscribe", preferencesUrl: "https://example.org/dashboard",
  }), [design, subject, orgName, orgAddress, logoUrl]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="nl-settings" className="rounded-xl border border-line bg-white p-4 shadow-sm">
          <h2 id="nl-settings" className="text-lg font-semibold">Email details</h2>
          <label className="mt-3 block font-semibold" htmlFor="nl-subject">Subject line</label>
          <input id="nl-subject" className={input} value={subject} maxLength={150} onChange={(e) => { setSubject(e.target.value); setDirty(true); }} />
          <label className="mt-3 block font-semibold" htmlFor="nl-pre">Preview text <span className="font-normal text-ink-soft">(shown after the subject in the inbox)</span></label>
          <input id="nl-pre" className={input} value={design.preheader} maxLength={200} onChange={(e) => change({ preheader: e.target.value })} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label className="block font-semibold" htmlFor="nl-title">Masthead title</label>
              <input id="nl-title" className={input} value={design.title} maxLength={120} onChange={(e) => change({ title: e.target.value })} /></div>
            <div><label className="block font-semibold" htmlFor="nl-date">Date line</label>
              <input id="nl-date" className={input} value={design.dateLine} maxLength={120} placeholder="e.g. October 2026" onChange={(e) => change({ dateLine: e.target.value })} /></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" className="size-4" checked={design.showLogo} onChange={(e) => change({ showLogo: e.target.checked })} />Show logo</label>
            <fieldset className="flex flex-wrap items-center gap-2"><legend className="sr-only">Accent color</legend>
              <span className="font-semibold">Accent</span>
              {ACCENTS.map((c) => (
                <label key={c.value} className="cursor-pointer" title={c.label}>
                  <input type="radio" name="accent" className="peer sr-only" checked={design.accent === c.value} onChange={() => change({ accent: c.value })} />
                  <span className="block size-8 rounded-full border-2 border-white ring-2 ring-transparent peer-checked:ring-ink peer-focus-visible:ring-teal-600" style={{ background: c.value }} />
                  <span className="sr-only">{c.label}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </section>

        <section aria-labelledby="nl-blocks" className="rounded-xl border border-line bg-white p-4 shadow-sm">
          <h2 id="nl-blocks" className="text-lg font-semibold">Content</h2>
          <p className="text-sm text-ink-soft">Merge fields such as {"{{donor_first_name}}"} are filled in for each donor.</p>
          {design.blocks.length === 0 && <p className="mt-3 rounded-md bg-paper-2 p-4 text-center text-ink-soft">No content yet. Add a block below.</p>}
          <ol className="mt-3 space-y-2">
            {design.blocks.map((b, i) => {
              const Icon = ICONS[b.type];
              const expanded = open === b.id;
              return (
                <li key={b.id} className={`rounded-lg border ${expanded ? "border-teal-800" : "border-line"}`}>
                  <div className="flex items-center gap-1 px-2 py-1">
                    <button type="button" onClick={() => setOpen(expanded ? null : b.id)} aria-expanded={expanded} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left">
                      {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                      <Icon size={18} aria-hidden="true" className="text-ink-soft" />
                      <span className="shrink-0 font-semibold">{BLOCK_LABELS[b.type]}</span>
                      <span className="truncate text-sm text-ink-soft">{summary(b)}</span>
                    </button>
                    <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${BLOCK_LABELS[b.type]} up`}><ArrowUp size={16} aria-hidden="true" /></button>
                    <button type="button" className={iconBtn} disabled={i === design.blocks.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${BLOCK_LABELS[b.type]} down`}><ArrowDown size={16} aria-hidden="true" /></button>
                    <button type="button" className={iconBtn} onClick={() => copy(i)} aria-label={`Copy ${BLOCK_LABELS[b.type]}`}><Copy size={16} aria-hidden="true" /></button>
                    <button type="button" className={iconBtn} onClick={() => remove(i)} aria-label={`Remove ${BLOCK_LABELS[b.type]}`}><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                  {expanded && <div className="border-t border-line p-3"><BlockEditor block={b} onChange={(p) => setBlock(b.id, p)} /></div>}
                </li>
              );
            })}
          </ol>
          <div className="mt-4">
            <p className="font-semibold">Add a block</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => {
                const Icon = ICONS[t];
                return <button key={t} type="button" onClick={() => add(newBlock(t))} className={`${btn} border border-line bg-white text-ink hover:bg-paper-2`}><Icon size={16} aria-hidden="true" />{BLOCK_LABELS[t]}</button>;
              })}
            </div>
            {projects.length > 0 && (
              <div className="mt-3">
                <label htmlFor="nl-project" className="block font-semibold">Add a project highlight</label>
                <select id="nl-project" className={input} value="" onChange={(e) => {
                  const p = projects[Number(e.target.value)];
                  if (p) add({ ...newBlock("story"), title: p.title, html: p.summary ? `<p>${escape(p.summary)}</p>` : "<p></p>", image: p.image, alt: p.title, linkLabel: "Learn more and give", linkUrl: p.url } as NewsletterBlock);
                }}>
                  <option value="">Choose a project…</option>
                  {projects.map((p, i) => <option key={p.url} value={i}>{p.title}</option>)}
                </select>
              </div>
            )}
          </div>
        </section>

        <div className="no-print sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white/95 p-3 shadow-md backdrop-blur">
          <button type="button" onClick={save} disabled={saving} className={`${btn} bg-teal-800 text-white hover:bg-teal-800/90`}><Save size={18} aria-hidden="true" />{saving ? "Saving…" : "Save newsletter"}</button>
          <button type="button" onClick={test} disabled={testing} className={`${btn} border-2 border-teal-800 text-teal-800 hover:bg-paper-2`}><Send size={18} aria-hidden="true" />{testing ? "Sending…" : "Send test to me"}</button>
          <span role="status" aria-live="polite" className="text-sm">
            {notice ? <span className={notice.ok ? "text-success" : "text-danger"}>{notice.text}</span> : dirty ? <span className="text-warning">Unsaved changes</span> : <span className="text-ink-soft">All changes saved</span>}
          </span>
        </div>
      </div>

      <section aria-labelledby="nl-preview" className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="nl-preview" className="text-lg font-semibold">Preview</h2>
          <div role="group" aria-label="Preview width" className="flex rounded-md border border-line bg-white">
            <button type="button" aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")} className={`${btn} min-h-10 aria-pressed:bg-paper-2`}><Monitor size={16} aria-hidden="true" />Desktop</button>
            <button type="button" aria-pressed={width === "phone"} onClick={() => setWidth("phone")} className={`${btn} min-h-10 aria-pressed:bg-paper-2`}><Smartphone size={16} aria-hidden="true" />Phone</button>
          </div>
        </div>
        <p className="text-sm text-ink-soft">Subject: <strong className="text-ink">{fill(subject, false)}</strong></p>
        <div className="mt-2 overflow-hidden rounded-xl border border-line bg-[#eef3f1]">
          {/* allow-same-origin (no scripts) so the site's own logo and uploaded pictures load under its image policy. */}
          <iframe title="Newsletter preview" sandbox="allow-same-origin" srcDoc={preview} className="mx-auto block h-[75vh] bg-white transition-[width]" style={{ width: width === "desktop" ? "100%" : 390, maxWidth: "100%" }} />
        </div>
      </section>
    </div>
  );
}

function summary(b: NewsletterBlock): string {
  const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  switch (b.type) {
    case "heading": return b.text;
    case "text": return strip(b.html);
    case "image": return b.alt || (b.src ? "Picture" : "No picture yet");
    case "button": return b.label;
    case "story": return b.title;
    case "spacer": return b.size;
    default: return "";
  }
}

function BlockEditor({ block: b, onChange }: { block: NewsletterBlock; onChange: (p: Partial<NewsletterBlock>) => void }) {
  const idp = `blk-${b.id}`;
  switch (b.type) {
    case "heading":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div><label className="block font-semibold" htmlFor={`${idp}-t`}>Heading</label><input id={`${idp}-t`} className={input} value={b.text} maxLength={200} onChange={(e) => onChange({ text: e.target.value })} /></div>
          <div><label className="block font-semibold" htmlFor={`${idp}-s`}>Size</label>
            <select id={`${idp}-s`} className={input} value={b.size} onChange={(e) => onChange({ size: e.target.value as "large" })}><option value="large">Large</option><option value="medium">Medium</option></select></div>
          <AlignPick id={idp} value={b.align} onChange={(align) => onChange({ align } as Partial<NewsletterBlock>)} />
        </div>
      );
    case "text":
      return <><span id={`${idp}-lbl`} className="sr-only">Text</span><EmailEditor initialHtml={b.html} labelledBy={`${idp}-lbl`} minHeight="min-h-40" onChange={(html) => onChange({ html })} /></>;
    case "image":
      return (
        <div className="space-y-3">
          <ImagePicker src={b.src} onSrc={(src) => onChange({ src })} id={idp} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="block font-semibold" htmlFor={`${idp}-alt`}>Description <span className="font-normal text-ink-soft">(for screen readers)</span></label><input id={`${idp}-alt`} className={input} value={b.alt} maxLength={300} onChange={(e) => onChange({ alt: e.target.value })} /></div>
            <div><label className="block font-semibold" htmlFor={`${idp}-cap`}>Caption</label><input id={`${idp}-cap`} className={input} value={b.caption} maxLength={300} onChange={(e) => onChange({ caption: e.target.value })} /></div>
            <div><label className="block font-semibold" htmlFor={`${idp}-link`}>Link when clicked</label><input id={`${idp}-link`} className={input} value={b.link} placeholder="https://…" onChange={(e) => onChange({ link: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-semibold" htmlFor={`${idp}-w`}>Width</label>
                <select id={`${idp}-w`} className={input} value={b.width} onChange={(e) => onChange({ width: e.target.value as "full" })}><option value="full">Full</option><option value="medium">Medium</option><option value="small">Small</option></select></div>
              <AlignPick id={idp} value={b.align} onChange={(align) => onChange({ align } as Partial<NewsletterBlock>)} />
            </div>
          </div>
        </div>
      );
    case "button":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div><label className="block font-semibold" htmlFor={`${idp}-l`}>Button text</label><input id={`${idp}-l`} className={input} value={b.label} maxLength={80} onChange={(e) => onChange({ label: e.target.value })} /></div>
          <div><label className="block font-semibold" htmlFor={`${idp}-u`}>Link</label><input id={`${idp}-u`} className={input} value={b.url} placeholder="https://…" onChange={(e) => onChange({ url: e.target.value })} /></div>
          <AlignPick id={idp} value={b.align} onChange={(align) => onChange({ align } as Partial<NewsletterBlock>)} />
        </div>
      );
    case "story":
      return (
        <div className="space-y-3">
          <div><label className="block font-semibold" htmlFor={`${idp}-t`}>Title</label><input id={`${idp}-t`} className={input} value={b.title} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} /></div>
          <div><span id={`${idp}-lbl`} className="block font-semibold">Text</span><div className="mt-1"><EmailEditor initialHtml={b.html} labelledBy={`${idp}-lbl`} minHeight="min-h-32" onChange={(html) => onChange({ html })} /></div></div>
          <ImagePicker src={b.image} onSrc={(image) => onChange({ image })} id={idp} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="block font-semibold" htmlFor={`${idp}-alt`}>Picture description</label><input id={`${idp}-alt`} className={input} value={b.alt} maxLength={300} onChange={(e) => onChange({ alt: e.target.value })} /></div>
            <div><label className="block font-semibold" htmlFor={`${idp}-side`}>Picture position</label>
              <select id={`${idp}-side`} className={input} value={b.imageSide} onChange={(e) => onChange({ imageSide: e.target.value as "left" })}><option value="left">Left of the text</option><option value="right">Right of the text</option><option value="top">Above the text</option></select></div>
            <div><label className="block font-semibold" htmlFor={`${idp}-ll`}>Link text</label><input id={`${idp}-ll`} className={input} value={b.linkLabel} maxLength={80} onChange={(e) => onChange({ linkLabel: e.target.value })} /></div>
            <div><label className="block font-semibold" htmlFor={`${idp}-lu`}>Link</label><input id={`${idp}-lu`} className={input} value={b.linkUrl} placeholder="https://…" onChange={(e) => onChange({ linkUrl: e.target.value })} /></div>
          </div>
        </div>
      );
    case "spacer":
      return (
        <div className="max-w-48"><label className="block font-semibold" htmlFor={`${idp}-sz`}>Height</label>
          <select id={`${idp}-sz`} className={input} value={b.size} onChange={(e) => onChange({ size: e.target.value as "small" })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></div>
      );
    case "divider":
      return <p className="text-sm text-ink-soft">A thin line between sections.</p>;
  }
}

function AlignPick({ id, value, onChange }: { id: string; value: "left" | "center" | "right"; onChange: (v: "left" | "center" | "right") => void }) {
  return (
    <div><label className="block font-semibold" htmlFor={`${id}-align`}>Alignment</label>
      <select id={`${id}-align`} className={input} value={value} onChange={(e) => onChange(e.target.value as "left" | "center" | "right")}>
        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
      </select></div>
  );
}

/** Upload a picture (stored as JPEG/PNG for email apps) or paste an https address. */
function ImagePicker({ src, onSrc, id }: { src: string; onSrc: (src: string) => void; id: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(f: File) {
    setBusy(true); setError(null);
    const fd = new FormData(); fd.set("file", f);
    const r = await uploadEmailImage(fd).catch(() => ({ ok: false as const, error: "The upload failed. Please try again." }));
    setBusy(false);
    if (r.ok) onSrc(r.url); else setError(r.error);
  }
  return (
    <div>
      <span className="block font-semibold">Picture</span>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail of any https address the user typed */}
        {src ? <img src={src} alt="" className="h-16 w-24 rounded-md object-cover" /> : <span className="flex h-16 w-24 items-center justify-center rounded-md bg-paper-2 text-xs text-ink-soft">None</span>}
        <button type="button" onClick={() => file.current?.click()} disabled={busy} className={`${btn} border border-line bg-white hover:bg-paper-2`}><ImageIcon size={16} aria-hidden="true" />{busy ? "Uploading…" : src ? "Replace picture" : "Upload picture"}</button>
        {src && <button type="button" onClick={() => onSrc("")} className="min-h-11 px-2 font-semibold text-danger hover:underline">Remove</button>}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      </div>
      <label className="mt-2 block text-sm text-ink-soft" htmlFor={`${id}-src`}>Or picture address <span className="block">Uploaded pictures show in this preview; pictures from other websites show in the email and test sends.</span></label>
      <input id={`${id}-src`} className={input} value={src} placeholder="https://…" onChange={(e) => onSrc(e.target.value)} />
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
