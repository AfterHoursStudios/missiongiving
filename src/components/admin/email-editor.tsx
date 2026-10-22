"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { CharacterCount } from "@tiptap/extensions";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ImagePlus, Italic, Link2, List, ListOrdered, Redo2, Underline, Undo2,
} from "lucide-react";
import { uploadEmailImage } from "@/lib/admin/email-images";
import { TEMPLATE_VARIABLES, TEMPLATE_VARIABLE_LABELS } from "@/lib/template-variables";
import { EMAIL_FONTS, normalizeFontStack } from "@/lib/email-fonts";

/** Font sizes in px (the email sanitizer allows 1-2 digit px values). Unset = the email default, 15 px. */
const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48];
const btn = "inline-flex size-10 items-center justify-center rounded-md text-ink hover:bg-paper-2 disabled:opacity-40 aria-pressed:bg-teal-800/10 aria-pressed:text-teal-800";
const sel = "min-h-10 rounded-md border border-line bg-white px-2 text-sm";

/**
 * The message box of the template builder: a formatted-text editor (bold, italic, underline, font, text size, paragraph style,
 * alignment, lists, links, pictures and merge fields). Its HTML goes into a hidden input `name`, sanitized again on save.
 */
export function EmailEditor({ name, initialHtml, labelledBy }: { name: string; initialHtml: string; labelledBy: string }) {
  const [html, setHtml] = useState(initialHtml);
  const editor = useEditor({
    immediatelyRender: false, // server-rendered page: create the editor in the browser only
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false, link: { openOnClick: false, protocols: ["mailto"], defaultProtocol: "https" } }),
      TextStyle, FontSize, FontFamily,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // Inline: a picture sits in a paragraph, so the align buttons move it left/center/right (<p style="text-align:…"><img></p>,
      // which every email app honours). Pictures saved earlier as their own block are wrapped in a paragraph on load.
      Image.configure({ inline: true, resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 40 } }),
      CharacterCount,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        "aria-labelledby": labelledBy, "aria-multiline": "true", role: "textbox",
        class: "email-body min-h-80 max-h-[32rem] overflow-y-auto px-4 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor: e }) => setHtml(e.getHTML()),
  });

  return (
    <div className="rounded-md border border-ink-soft/60 bg-white focus-within:border-teal-800">
      <input type="hidden" name={name} value={html} />
      {editor ? <Toolbar editor={editor} /> : <div className="h-12 border-b border-line" />}
      <EditorContent editor={editor} />
      {editor && <Counts editor={editor} />}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }), center: e.isActive({ textAlign: "center" }), right: e.isActive({ textAlign: "right" }),
      block: e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
      size: (e.getAttributes("textStyle").fontSize as string | undefined) ?? "",
      font: normalizeFontStack((e.getAttributes("textStyle").fontFamily as string | undefined) ?? ""),
      undo: e.can().undo(), redo: e.can().redo(),
    }),
  });
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const c = () => editor.chain().focus();

  async function upload(f: File) {
    setError(null); setUploading(true);
    const fd = new FormData(); fd.set("file", f);
    const r = await uploadEmailImage(fd).catch(() => ({ ok: false as const, error: "The upload failed. Please try again." }));
    setUploading(false);
    if (!r.ok) return setError(r.error);
    // Shown no wider than the email (about 600 px); drag a corner to resize.
    c().setImage({ src: r.url, alt: "", width: Math.min(r.width, 560) }).run();
  }

  function applyLink() {
    const v = href.trim();
    if (!v) c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: /^(https:\/\/|mailto:)/i.test(v) ? v : `https://${v.replace(/^http:\/\//i, "")}` }).run();
    setLinkOpen(false);
  }

  return (
    <div className="border-b border-line">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 px-2 py-1">
        <button type="button" className={btn} aria-pressed={s.bold} aria-label="Bold" title="Bold" onClick={() => c().toggleBold().run()}><Bold size={18} aria-hidden="true" /></button>
        <button type="button" className={btn} aria-pressed={s.italic} aria-label="Italic" title="Italic" onClick={() => c().toggleItalic().run()}><Italic size={18} aria-hidden="true" /></button>
        <button type="button" className={btn} aria-pressed={s.underline} aria-label="Underline" title="Underline" onClick={() => c().toggleUnderline().run()}><Underline size={18} aria-hidden="true" /></button>
        <select aria-label="Font" title="Font" className={`${sel} max-w-40`} value={EMAIL_FONTS.some((f) => f.stack === s.font) ? s.font : ""}
          onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}>
          <option value="">Default font</option>
          {EMAIL_FONTS.map((f) => <option key={f.label} value={f.stack} style={{ fontFamily: f.stack }}>{f.label}</option>)}
        </select>
        <select aria-label="Font size" title="Font size" className={sel} value={s.size} onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}>
          <option value="">Size: 15 (default)</option>
          {SIZES.map((n) => <option key={n} value={`${n}px`}>{n}</option>)}
          {s.size && !SIZES.some((n) => `${n}px` === s.size) && <option value={s.size}>{s.size.replace("px", "")}</option>}
        </select>
        <select aria-label="Paragraph style" title="Paragraph style" className={sel} value={s.block}
          onChange={(e) => (e.target.value === "p" ? c().setParagraph().run() : c().setHeading({ level: e.target.value === "h2" ? 2 : 3 }).run())}>
          <option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option>
        </select>
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        <button type="button" className={btn} aria-pressed={s.left} aria-label="Align left" title="Align left" onClick={() => c().setTextAlign("left").run()}><AlignLeft size={18} aria-hidden="true" /></button>
        <button type="button" className={btn} aria-pressed={s.center} aria-label="Center" title="Center" onClick={() => c().setTextAlign("center").run()}><AlignCenter size={18} aria-hidden="true" /></button>
        <button type="button" className={btn} aria-pressed={s.right} aria-label="Align right" title="Align right" onClick={() => c().setTextAlign("right").run()}><AlignRight size={18} aria-hidden="true" /></button>
        <button type="button" className={btn} aria-pressed={s.bullet} aria-label="Bulleted list" title="Bulleted list" onClick={() => c().toggleBulletList().run()}><List size={18} aria-hidden="true" /></button>
        <button type="button" className={btn} aria-pressed={s.ordered} aria-label="Numbered list" title="Numbered list" onClick={() => c().toggleOrderedList().run()}><ListOrdered size={18} aria-hidden="true" /></button>
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        <button type="button" className={btn} disabled={uploading} aria-label="Insert picture" title="Insert picture" onClick={() => file.current?.click()}><ImagePlus size={18} aria-hidden="true" /></button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        <button type="button" className={btn} aria-pressed={s.link} aria-expanded={linkOpen} aria-label="Link" title="Link"
          onClick={() => { setHref((editor.getAttributes("link").href as string | undefined) ?? ""); setLinkOpen((o) => !o); }}><Link2 size={18} aria-hidden="true" /></button>
        <select aria-label="Insert merge field" className={`${sel} font-semibold`} value="" onChange={(e) => { if (e.target.value) c().insertContent(`{{${e.target.value}}}`).run(); }}>
          <option value="">Insert merge field</option>
          {TEMPLATE_VARIABLES.map((v) => <option key={v} value={v}>{TEMPLATE_VARIABLE_LABELS[v]}</option>)}
        </select>
        <span className="ml-auto flex">
          <button type="button" className={btn} disabled={!s.undo} aria-label="Undo" title="Undo" onClick={() => c().undo().run()}><Undo2 size={18} aria-hidden="true" /></button>
          <button type="button" className={btn} disabled={!s.redo} aria-label="Redo" title="Redo" onClick={() => c().redo().run()}><Redo2 size={18} aria-hidden="true" /></button>
        </span>
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          <label htmlFor="link-href" className="text-sm font-semibold">Link address</label>
          <input id="link-href" type="text" inputMode="url" placeholder="https://… or mailto:…" value={href} onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }} className="min-h-10 flex-1 rounded-md border border-line px-2" />
          <button type="button" onClick={applyLink} className="min-h-10 rounded-md bg-teal-800 px-3 font-semibold text-white">{href.trim() ? "Apply" : "Remove link"}</button>
          <button type="button" onClick={() => setLinkOpen(false)} className="min-h-10 px-2 font-semibold text-teal-600 hover:underline">Cancel</button>
        </div>
      )}
      {uploading && <p role="status" className="border-t border-line px-3 py-2 text-sm text-ink-soft">Uploading picture…</p>}
      {error && <p role="alert" className="border-t border-line bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function Counts({ editor }: { editor: Editor }) {
  const n = useEditorState({ editor, selector: ({ editor: e }) => ({ words: e.storage.characterCount.words(), chars: e.storage.characterCount.characters() }) });
  return <p className="flex justify-end gap-6 border-t border-line px-4 py-1.5 text-sm text-ink-soft"><span>Words: {n.words}</span><span>Characters: {n.chars}</span></p>;
}
